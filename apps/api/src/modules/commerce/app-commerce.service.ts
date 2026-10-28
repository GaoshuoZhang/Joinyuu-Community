import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import type { CommerceBill, CommerceOrder, MallGoods, Prisma, Space, User, UserIdentity } from '@prisma/client'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { RedisService } from '../../common/redis/redis.service'
import { formatNow, formatToday } from '../../common/utils/time'
import { billableHours } from '../../common/spaces/booking-fee'
import { eventBlocksWindow, eventCoversDate, eventOccupiesSpace } from '../../common/spaces/event-occupancy'
import { assertEnterprisePermission } from '../../common/enterprise/enterprise-permission'
import { assertRealnameAllowed } from '../app/realname/realname.service'
import { WechatPayClient } from './wechat-pay.client'
import { AppPaymentLaunch, AppPayMethod, CommercePaymentService } from './commerce-payment.service'
import { CommerceFulfillmentService } from './commerce-fulfillment.service'
import { BillQueryDto, CreateOrderDto, CreateQuoteDto, PayOrderDto, RefundRequestDto, TransactionQueryDto } from './app-commerce.dto'

const QUOTE_TTL_MS = 10 * 60_000
const PAY_TTL_MS = 15 * 60_000
const OAUTH_TICKET_TTL = 600
const DEFAULT_VOUCHER_VALID_DAYS = 30

type Identity = Pick<UserIdentity, 'type' | 'level'>
type AppUser = Pick<User, 'uid' | 'nickname' | 'realName' | 'phone' | 'email' | 'status'> & { identities: Array<Identity & { enterpriseName?: string | null }> }
type OrderWithBill = CommerceOrder & {
  bill: (CommerceBill & { payments: Array<{ id: string; method: string; status: string; expiresAt: Date; amountFen: number; createdAt: Date; refunds: Array<{ id: string; status: string; amountFen: number; reason: string; createdAt: Date; completedAt: Date | null }> }> }) | null
}
interface PricedSource {
  sourceType: CreateQuoteDto['sourceType']
  sourceId: string
  sourceName: string
  buyerType: 'user' | 'enterprise'
  buyerId: string
  buyerName: string
  unitPriceFen: number
  amountFen: number
  snapshot: {
    title: string
    subtitle: string
    lines: Array<{ label: string; value: string }>
    refundPolicy: string
    notes: string[]
    sourceLink: string
    validDays?: number
    eventStartTime?: string
    spaceDate?: string
    spaceStart?: string
    spaceEnd?: string
  }
}
interface BenefitView {
  type: 'voucher' | 'reservation' | 'ticket' | 'bill'
  id: string
  title: string
  status: string
  link: string
  completed: boolean
  voucherCode?: string
  voucherExpiresAt?: string
  date?: string
  startTime?: string
  endTime?: string
  checkedIn?: boolean
  eventStartTime?: string
  /** 活动状态：活动取消时即使报名已被同步取消，也仍应允许退款。 */
  eventStatus?: string
}

/* 客户端在线收费（/api/app/commerce + /api/app/me/transactions|bills）：
 * 报价冻结价格/政策快照 → 创建订单并占用库存/时段/名额 → 微信 JSAPI/H5/Native 支付 →
 * 支付通知/查单确认资金 → 同事务履约发券/确认预约/报名 → 现金交易与全额退款申请。
 * 金额全部由后端计算；客户端只提交来源、选择项与原因，不提交可结算金额。
 * 审核型收费、收费候补、部分退款与企业财务授权尚未确认，统一在后端阻断并提示联系运营。 */
@Injectable()
export class AppCommerceService {
  private readonly logger = new Logger(AppCommerceService.name)
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly redis: RedisService,
    private readonly wx: WechatPayClient,
    private readonly payments: CommercePaymentService,
    private readonly fulfillment: CommerceFulfillmentService,
  ) {}

  /* ---------------- 能力与环境 ---------------- */

  async capabilities(uid: string, userAgent: string) {
    const wx = await this.wx.config()
    const config = await this.db.systemConfig.findUnique({ where: { id: 1 } })
    const environment = detectEnvironment(userAgent)
    const methods: AppPayMethod[] = []
    let unavailableReason: string | null = null
    if (!wx.ready) unavailableReason = '微信收款尚未完成配置'
    else if (!wx.enabled) unavailableReason = '微信收款尚未启用'
    else if (environment === 'wechat') {
      if (wx.jsapiReady) methods.push('jsapi')
      else unavailableReason = wx.webOAuth?.reason || '微信内网页支付尚未完成配置'
    } else if (environment === 'mobile') methods.push('h5')
    else methods.push('native')

    let jsapiAuthorized = false
    if (methods.includes('jsapi')) {
      const settings = await this.wx.webOAuthSettings()
      if (settings.appid) {
        jsapiAuthorized = Boolean(await this.db.wechatUserBinding.findUnique({ where: { userId_appid: { userId: uid, appid: settings.appid } }, select: { id: true } }))
      }
    }
    const moduleState = (flag: boolean | undefined) => {
      if (!wx.ready) return { enabled: false, reason: '微信收款尚未完成配置' }
      if (!wx.enabled) return { enabled: false, reason: '微信收款尚未启用' }
      if (flag !== true) return { enabled: false, reason: '该模块在线支付尚未开放' }
      return { enabled: true, reason: null }
    }
    return {
      serverTime: new Date().toISOString(),
      environment,
      quoteTtlMinutes: QUOTE_TTL_MS / 60000,
      payTtlMinutes: PAY_TTL_MS / 60000,
      wechat: {
        ready: wx.ready,
        enabled: wx.enabled,
        methods,
        unavailableReason,
        jsapiAuthorized,
        webOAuthReady: Boolean(wx.webOAuth?.ready),
        merchantName: config?.siteName ?? '',
      },
      modules: {
        mall: moduleState(config?.cashMallOpen),
        space: moduleState(config?.cashSpaceOpen),
        event: moduleState(config?.cashEventOpen),
        lease: moduleState(config?.cashLeaseOpen),
      },
    }
  }

  private async assertModuleOpen(sourceType: CreateQuoteDto['sourceType']) {
    /* 微信收款未配置/未启用时不能创建报价、订单或占用库存/时段/名额，避免用户无法付款却被占用资源。 */
    const wx = await this.wx.config()
    if (!wx.ready) throw new ServiceUnavailableException('微信收款尚未完成配置')
    if (!wx.enabled) throw new ServiceUnavailableException('微信收款尚未启用')
    const config = await this.db.systemConfig.findUnique({ where: { id: 1 } })
    const flag = sourceType === 'mall' ? config?.cashMallOpen
      : sourceType === 'space' ? config?.cashSpaceOpen
      : sourceType === 'event' ? config?.cashEventOpen
      : config?.cashLeaseOpen
    if (flag !== true) throw new ServiceUnavailableException('该模块在线支付尚未开放')
  }

  /* ---------------- 报价 ---------------- */

  async createQuote(uid: string, dto: CreateQuoteDto) {
    await this.assertModuleOpen(dto.sourceType)
    const pricing = await this.db.$transaction((tx) => this.priceSource(tx, uid, dto))
    await this.db.commerceQuote.updateMany({ where: { createdBy: uid, status: 'open', expiresAt: { lte: new Date() } }, data: { status: 'expired' } })
    const id = `CQ${randomBytes(14).toString('hex')}`
    const quote = await this.db.commerceQuote.create({
      data: {
        id,
        createdBy: uid,
        sourceType: pricing.sourceType,
        sourceId: pricing.sourceId,
        sourceName: pricing.sourceName,
        buyerType: pricing.buyerType,
        buyerId: pricing.buyerId,
        buyerName: pricing.buyerName,
        quantity: 1,
        unitPriceFen: pricing.unitPriceFen,
        amountFen: pricing.amountFen,
        payload: dto as unknown as Prisma.InputJsonValue,
        snapshot: pricing.snapshot as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
      },
    })
    return this.quoteView(quote)
  }

  async quoteDetail(uid: string, id: string) {
    const quote = await this.db.commerceQuote.findUnique({ where: { id } })
    if (!quote || quote.createdBy !== uid) throw new NotFoundException('报价不存在')
    if (quote.status === 'open' && quote.expiresAt.getTime() <= Date.now()) {
      await this.db.commerceQuote.updateMany({ where: { id, status: 'open' }, data: { status: 'expired' } })
      quote.status = 'expired'
    }
    return this.quoteView(quote)
  }

  private quoteView(quote: { id: string; sourceType: string; sourceId: string; sourceName: string; buyerType: string; buyerName: string; quantity: number; unitPriceFen: number; amountFen: number; status: string; expiresAt: Date; orderId: string | null; snapshot: Prisma.JsonValue; createdAt: Date }) {
    return {
      id: quote.id,
      sourceType: quote.sourceType,
      sourceId: quote.sourceId,
      sourceName: quote.sourceName,
      buyerType: quote.buyerType,
      buyerName: quote.buyerName,
      quantity: quote.quantity,
      unitPriceFen: quote.unitPriceFen,
      amountFen: quote.amountFen,
      status: quote.status,
      expiresAt: quote.expiresAt,
      orderId: quote.orderId,
      snapshot: quote.snapshot,
      createdAt: quote.createdAt,
      serverTime: new Date().toISOString(),
    }
  }

  /** 价格与资格的唯一计算入口：报价、创建订单、订单复查共用。 */
  private async priceSource(tx: Prisma.TransactionClient, uid: string, dto: CreateQuoteDto): Promise<PricedSource> {
    const user = await tx.user.findUnique({
      where: { uid },
      select: { uid: true, nickname: true, realName: true, phone: true, email: true, status: true, identities: { select: { type: true, level: true, enterpriseName: true } } },
    }) as AppUser | null
    if (!user || user.status !== 'active') throw new NotFoundException('用户不存在或已停用')
    if (dto.sourceType === 'mall') return this.priceMall(tx, user, dto)
    if (dto.sourceType === 'space') return this.priceSpace(tx, user, dto)
    if (dto.sourceType === 'event') return this.priceEvent(tx, user, dto)
    return this.priceLeaseBill(tx, user, dto)
  }

  private async priceMall(tx: Prisma.TransactionClient, user: AppUser, dto: CreateQuoteDto): Promise<PricedSource> {
    const goods = await tx.mallGoods.findFirst({ where: { id: dto.sourceId, deletedAt: null } })
    if (!goods || (goods.status !== 'on' && goods.status !== 'restock')) throw new NotFoundException('商品不存在')
    const category = goods.category ? await tx.dictEntry.findUnique({ where: { type_code: { type: 'goods_category', code: goods.category } } }) : null
    if (!this.canSeeGoods(goods, category, user.identities)) throw new NotFoundException('商品不存在')
    if (!this.canOrderGoods(goods, category, user.identities)) throw new ForbiddenException('当前身份暂不可购买该商品')
    if (goods.chargeAmountFen <= 0) throw new BadRequestException('该商品不支持现金购买')
    if (goods.stock <= 0) throw new ConflictException('商品已售罄')
    const validDays = goods.validDays ?? DEFAULT_VOUCHER_VALID_DAYS
    return {
      sourceType: 'mall', sourceId: goods.id, sourceName: goods.name,
      buyerType: 'user', buyerId: user.uid, buyerName: user.nickname,
      unitPriceFen: goods.chargeAmountFen, amountFen: goods.chargeAmountFen,
      snapshot: {
        title: goods.name,
        subtitle: '商品 · 券码核销',
        lines: [
          { label: '交付方式', value: '支付成功后发放券码，到店核销' },
          { label: '有效期', value: validDays === 0 ? '长期有效' : `支付成功后 ${validDays} 天内有效` },
        ],
        refundPolicy: goods.chargeRefundPolicy || '券码未使用且未过期前可申请整单退款，需运营审核。',
        notes: ['每单限购一件，不支持积分与现金混合支付。', '券码一经核销不可退款。'],
        sourceLink: `/mall/${goods.id}`,
        validDays,
      },
    }
  }

  private async priceSpace(tx: Prisma.TransactionClient, user: AppUser, dto: CreateQuoteDto): Promise<PricedSource> {
    const space = await tx.space.findFirst({ where: { id: dto.sourceId, deletedAt: null } })
    if (!space) throw new NotFoundException('空间不存在')
    if (!space.needReservation || space.status !== 'available') throw new BadRequestException('空间暂不可预约')
    if (space.chargeAmountFen <= 0) throw new BadRequestException('该空间不支持现金预约')
    if (space.needApproval) throw new BadRequestException('该空间的收费预约需运营审核，暂未开放在线支付，请联系运营')
    const { date, start, end } = this.validateSpaceWindow(space, dto)
    const attendees = dto.attendees ?? 1
    const subject = await this.resolveSpaceSubject(tx, user, dto)
    await this.assertReservable(space, user, subject.identityType)
    await this.assertSpaceFree(tx, space, user.uid, date, start, end)
    const hours = billableHours(start, end)
    if (hours <= 0) throw new BadRequestException('预约时段无效')
    return {
      sourceType: 'space', sourceId: space.id, sourceName: space.name,
      buyerType: subject.buyerType, buyerId: subject.buyerId, buyerName: subject.buyerName,
      unitPriceFen: space.chargeAmountFen, amountFen: space.chargeAmountFen * hours,
      snapshot: {
        title: `${space.name} ${date} ${start}-${end}`,
        subtitle: '公共空间 · 按时计费',
        lines: [
          { label: '预约日期', value: date },
          { label: '预约时段', value: `${start} - ${end}` },
          { label: '计费时长', value: `${hours} 小时（不足 1 小时按 1 小时计）` },
          { label: '单价', value: `¥${fenText(space.chargeAmountFen)}/小时` },
          { label: '使用人数', value: `${attendees} 人` },
          { label: '预约主体', value: subject.subjectName },
        ],
        refundPolicy: space.chargeRefundPolicy || '预约开始前可申请整单退款，需运营审核；已开始或已结束不可退款。',
        notes: ['付款成功后预约才会生效。', '不支持积分与现金混合支付。'],
        sourceLink: `/spaces/${space.id}/reserve`,
        spaceDate: date, spaceStart: start, spaceEnd: end,
      },
    }
  }

  private async priceEvent(tx: Prisma.TransactionClient, user: AppUser, dto: CreateQuoteDto): Promise<PricedSource> {
    const event = await tx.communityEvent.findUnique({ where: { id: dto.sourceId } })
    if (!event || event.deletedAt || event.status !== 'published') throw new NotFoundException('活动不存在')
    if (!this.scopeMatches(event.visibilityIdentities, event.visibilityLevels, user.identities)) throw new NotFoundException('活动不存在')
    if (!event.enrollmentOpen) throw new BadRequestException('报名暂未开放')
    if (event.enrollmentDeadline && formatNow() > event.enrollmentDeadline) throw new BadRequestException('报名已截止')
    if (event.chargeAmountFen <= 0) throw new BadRequestException('该活动不支持现金报名')
    if (event.requireReview) throw new BadRequestException('该收费活动需先审核，暂未开放在线支付，请联系运营')
    await assertRealnameAllowed(this.db, user.uid, 'enroll')
    if (event.enrollRequirePhone && !(user.phone ?? '').trim()) throw new BadRequestException('该活动报名需先绑定手机号，请在「账号与安全」中完成绑定')
    if (event.enrollRequireEmail && !(user.email ?? '').trim()) throw new BadRequestException('该活动报名需先绑定邮箱，请在「账号与安全」中完成绑定')
    if (!this.scopeMatches(event.enrollmentIdentities, event.enrollmentLevels, user.identities)) throw new BadRequestException('您暂不符合该活动的报名条件')
    const existing = await tx.eventEnrollment.findUnique({ where: { eventId_userId: { eventId: event.id, userId: user.uid } } })
    if (existing && existing.status !== 'cancelled' && existing.status !== 'rejected') throw new ConflictException('您已报名或正在支付该活动')
    const occupied = await tx.eventEnrollment.count({ where: { eventId: event.id, status: { in: ['approved', 'pending_payment'] } } })
    if (occupied >= event.capacity) throw new ConflictException('活动名额已满，暂不支持在线付费报名')
    return {
      sourceType: 'event', sourceId: event.id, sourceName: event.title,
      buyerType: 'user', buyerId: user.uid, buyerName: user.realName || user.nickname,
      unitPriceFen: event.chargeAmountFen, amountFen: event.chargeAmountFen,
      snapshot: {
        title: event.title,
        subtitle: '活动 · 每人次',
        lines: [
          { label: '活动时间', value: `${event.startTime} - ${event.endTime}` },
          { label: '活动地点', value: event.location },
          { label: '报名主体', value: user.realName || user.nickname },
          ...(event.enrollPoints != null && event.enrollPoints > 0 ? [{ label: '报名奖励', value: `${event.enrollPoints} 积分（报名成功后发放，不可抵扣现金）` }] : []),
        ],
        refundPolicy: event.chargeRefundPolicy || '活动开始前可申请整单退款，需运营审核；已签到或已开始不可退款。',
        notes: ['付款成功后报名与电子票才生效。', '不支持积分与现金混合支付。'],
        sourceLink: `/events/${event.id}`,
        eventStartTime: event.startTime,
      },
    }
  }

  private async priceLeaseBill(tx: Prisma.TransactionClient, user: AppUser, dto: CreateQuoteDto): Promise<PricedSource> {
    const bill = await tx.commerceBill.findUnique({ where: { id: dto.sourceId } })
    if (!bill) throw new NotFoundException('账单不存在')
    await this.assertBillAccess(user.uid, bill)
    if (bill.status !== 'unpaid') throw new ConflictException('账单已支付或已作废')
    if (bill.paidFen > 0) throw new ConflictException('账单存在部分收款，请联系运营')
    if (await tx.commerceReceipt.count({ where: { billId: bill.id, status: 'pending' } })) throw new ConflictException('账单存在待复核收款，请联系运营')
    const snapshot = (bill.snapshot ?? {}) as { agreement?: string; pricing?: { refundPolicy?: string } }
    return {
      sourceType: 'lease_bill', sourceId: bill.id, sourceName: bill.title,
      buyerType: bill.buyerType as 'user' | 'enterprise', buyerId: bill.buyerId, buyerName: bill.buyerName,
      unitPriceFen: bill.amountFen - bill.paidFen, amountFen: bill.amountFen - bill.paidFen,
      snapshot: {
        title: bill.title,
        subtitle: '租约账单 · 在线缴费',
        lines: [
          { label: '账期', value: bill.period },
          { label: '购买主体', value: bill.buyerName },
          { label: '到期日期', value: bill.dueDate },
          ...(snapshot.agreement ? [{ label: '费用说明', value: snapshot.agreement }] : []),
        ],
        refundPolicy: snapshot.pricing?.refundPolicy || '按租约约定执行，退款请联系运营处理。',
        notes: ['缴费成功后不会自动改变租期、办公位分配或生成续租合同。'],
        sourceLink: '/me/leases',
      },
    }
  }

  /* ---------------- 创建订单 ---------------- */

  async createOrder(uid: string, dto: CreateOrderDto) {
    /* 报价后、创建订单前可能被管理员关闭模块：先复核，再占用资源。 */
    const preQuote = await this.db.commerceQuote.findUnique({ where: { id: dto.quoteId }, select: { createdBy: true, sourceType: true } })
    if (!preQuote || preQuote.createdBy !== uid) throw new NotFoundException('报价不存在')
    await this.assertModuleOpen(preQuote.sourceType as CreateQuoteDto['sourceType'])
    const orderId = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CommerceQuote" WHERE id = ${dto.quoteId} FOR UPDATE`
      const quote = await tx.commerceQuote.findUnique({ where: { id: dto.quoteId } })
      if (!quote || quote.createdBy !== uid) throw new NotFoundException('报价不存在')
      if (quote.status === 'consumed' && quote.orderId) return quote.orderId
      if (quote.status !== 'open' || quote.expiresAt.getTime() <= Date.now()) {
        await tx.commerceQuote.updateMany({ where: { id: quote.id, status: 'open' }, data: { status: 'expired' } })
        throw new ConflictException('报价已过期，请重新确认')
      }
      const payload = quote.payload as unknown as CreateQuoteDto
      const pricing = await this.priceSource(tx, uid, payload)
      if (pricing.amountFen !== quote.amountFen || pricing.unitPriceFen !== quote.unitPriceFen || pricing.sourceName !== quote.sourceName) {
        await tx.commerceQuote.updateMany({ where: { id: quote.id, status: 'open' }, data: { status: 'expired' } })
        throw new ConflictException('价格或业务信息已变化，请重新确认')
      }

      if (quote.sourceType === 'lease_bill') {
        const inherited = await this.createLeaseBillOrder(tx, uid, quote)
        await tx.commerceQuote.update({ where: { id: quote.id }, data: { status: 'consumed', orderId: inherited } })
        return inherited
      }

      const orderId = `CO${randomBytes(14).toString('hex')}`
      const billId = await this.ids.next('CB', tx)
      const module = quote.sourceType as 'mall' | 'space' | 'event'
      const orderSnapshot = quote.snapshot as Prisma.InputJsonValue
      let reservationId: string | null = null
      let enrollmentId: number | null = null

      if (quote.sourceType === 'mall') {
        const goods = await tx.mallGoods.findFirst({ where: { id: quote.sourceId, deletedAt: null } })
        if (!goods || goods.chargeAmountFen !== quote.unitPriceFen) throw new ConflictException('商品价格已变化，请重新确认')
        const stock = await tx.mallGoods.updateMany({
          where: { id: goods.id, status: { in: ['on', 'restock'] }, deletedAt: null, chargeAmountFen: quote.unitPriceFen, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        })
        if (!stock.count) throw new ConflictException('库存不足或价格已变化，请重新确认')
        await tx.mallGoods.updateMany({ where: { id: goods.id, status: 'on', stock: 0 }, data: { status: 'restock' } })
      } else if (quote.sourceType === 'space') {
        reservationId = await this.occupySpace(tx, uid, quote, payload)
      } else {
        enrollmentId = await this.occupyEventSlot(tx, uid, quote, payload)
      }

      const businessKey = createHash('sha256').update(JSON.stringify(['app', orderId])).digest('hex')
      await tx.commerceBill.create({
        data: {
          id: billId, businessKey, module, sourceId: quote.sourceId, sourceName: quote.sourceName,
          buyerType: quote.buyerType, buyerId: quote.buyerId, buyerName: quote.buyerName,
          title: quote.sourceName, period: '单次', amountFen: quote.amountFen, dueDate: formatToday(),
          createdBy: `app:${uid}`,
          snapshot: {
            agreement: '客户端在线支付',
            pricing: { unitAmountFen: quote.unitPriceFen, quantity: quote.quantity, unit: module === 'space' ? '小时' : module === 'event' ? '人次' : '件', refundPolicy: (quote.snapshot as { refundPolicy?: string }).refundPolicy ?? '' },
          },
        },
      })
      await tx.commerceOrder.create({
        data: {
          id: orderId, billId, quoteId: quote.id, sourceType: quote.sourceType, sourceId: quote.sourceId, sourceName: quote.sourceName,
          buyerType: quote.buyerType, buyerId: quote.buyerId, buyerName: quote.buyerName, createdBy: uid,
          quantity: quote.quantity, unitPriceFen: quote.unitPriceFen, amountFen: quote.amountFen,
          snapshot: orderSnapshot, reservationId, enrollmentId,
          expiresAt: new Date(Date.now() + PAY_TTL_MS),
        },
      })
      if (reservationId) await tx.spaceReservation.update({ where: { id: reservationId }, data: { commerceOrderId: orderId } })
      if (enrollmentId) await tx.eventEnrollment.update({ where: { id: enrollmentId }, data: { commerceOrderId: orderId } })
      await tx.commerceQuote.update({ where: { id: quote.id }, data: { status: 'consumed', orderId } })
      await tx.auditLog.create({
        data: {
          id: await this.ids.next('AL', tx), module: '交易经营', action: '创建客户端现金订单', target: orderId,
          detail: `${quote.amountFen} 分；${quote.sourceType}`, operator: `用户:${uid}`, at: formatNow(),
        },
      })
      return orderId
    })
    return this.orderDetail(uid, orderId)
  }

  /** 租约账单不重复出账：订单直接关联后台已出应收账单。 */
  private async createLeaseBillOrder(tx: Prisma.TransactionClient, uid: string, quote: { id: string; sourceId: string; sourceName: string; buyerType: string; buyerId: string; buyerName: string; amountFen: number; unitPriceFen: number; snapshot: Prisma.JsonValue }): Promise<string> {
    await tx.$queryRaw`SELECT id FROM "CommerceBill" WHERE id = ${quote.sourceId} FOR UPDATE`
    const bill = await tx.commerceBill.findUnique({ where: { id: quote.sourceId }, include: { order: true } })
    if (!bill) throw new NotFoundException('账单不存在')
    await this.assertBillAccess(uid, bill)
    if (bill.status !== 'unpaid') throw new ConflictException('账单已支付或已作废')
    if (bill.paidFen > 0) throw new ConflictException('账单存在部分收款，请联系运营')
    if (bill.amountFen - bill.paidFen !== quote.amountFen) throw new ConflictException('账单金额已变化，请重新确认')
    if (bill.order) {
      if (bill.order.paymentStatus === 'paid') throw new ConflictException('账单已支付')
      if (!['none', 'rejected'].includes(bill.order.afterSalesStatus)) throw new ConflictException('账单正在售后处理中')
      await tx.commerceOrder.update({
        where: { id: bill.order.id },
        data: {
          quoteId: quote.id, paymentStatus: 'unpaid', fulfillmentStatus: 'pending', afterSalesStatus: 'none',
          closedAt: null, lastError: null, expiresAt: new Date(Date.now() + PAY_TTL_MS), snapshot: quote.snapshot as Prisma.InputJsonValue,
        },
      })
      return bill.order.id
    }
    const orderId = `CO${randomBytes(14).toString('hex')}`
    await tx.commerceOrder.create({
      data: {
        id: orderId, billId: bill.id, quoteId: quote.id, sourceType: 'lease_bill', sourceId: bill.sourceId, sourceName: quote.sourceName,
        buyerType: quote.buyerType, buyerId: quote.buyerId, buyerName: quote.buyerName, createdBy: uid,
        quantity: 1, unitPriceFen: quote.unitPriceFen, amountFen: quote.amountFen,
        snapshot: quote.snapshot as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + PAY_TTL_MS),
      },
    })
    await tx.auditLog.create({
      data: {
        id: await this.ids.next('AL', tx), module: '交易经营', action: '创建客户端账单缴费订单', target: orderId,
        detail: `${quote.amountFen} 分；${bill.id}`, operator: `用户:${uid}`, at: formatNow(),
      },
    })
    return orderId
  }

  private async occupySpace(tx: Prisma.TransactionClient, uid: string, quote: { sourceId: string; sourceName: string; buyerId: string; buyerName: string; amountFen: number }, payload: CreateQuoteDto): Promise<string> {
    const space = await tx.space.findUnique({ where: { id: quote.sourceId } })
    if (!space) throw new NotFoundException('空间不存在')
    const { date, start, end } = this.validateSpaceWindow(space, payload)
    const user = await tx.user.findUniqueOrThrow({ where: { uid }, select: { uid: true, nickname: true, phone: true, realName: true, identities: { select: { type: true, level: true, enterpriseName: true } } } })
    const subject = await this.resolveSpaceSubject(tx, user as AppUser, payload)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${space.id}:${date}`}))`
    const conflicting = await tx.spaceReservation.findFirst({
      where: { spaceId: space.id, date, status: { in: ['pending', 'pending_payment', 'approved'] }, deletedAt: null, startTime: { lt: end }, endTime: { gt: start } },
      select: { id: true },
    })
    if (conflicting) throw new ConflictException('该时段已被预约，请选择其他时间')
    const id = await this.ids.next('SR', tx)
    const now = formatNow()
    await tx.spaceReservation.create({
      data: {
        id, userId: uid, userName: user.realName || user.nickname, phone: user.phone ?? '', spaceId: space.id, spaceName: space.name,
        date, startTime: start, endTime: end, purpose: (payload.topic ?? '').trim(), attendees: payload.attendees ?? 1,
        feePoints: 0, amountFen: quote.amountFen, status: 'pending_payment', submittedAt: now,
        records: [
          { at: now, action: 'submit', text: `${space.name} ${date} ${start}-${end} 预约提交（现金）` },
          { at: now, action: 'pay_pending', step: '待付款', text: `应付 ¥${fenText(quote.amountFen)}，付款成功后预约生效` },
        ],
        identityType: subject.identityType, subjectName: subject.subjectName, asEnterpriseId: payload.asEnterpriseId ?? null,
      },
    })
    return id
  }

  private async occupyEventSlot(tx: Prisma.TransactionClient, uid: string, quote: { sourceId: string; amountFen: number }, payload: CreateQuoteDto): Promise<number> {
    const event = await tx.communityEvent.findUnique({ where: { id: quote.sourceId } })
    if (!event) throw new NotFoundException('活动不存在')
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-enroll:${event.id}`}))`
    const existing = await tx.eventEnrollment.findUnique({ where: { eventId_userId: { eventId: event.id, userId: uid } } })
    if (existing && existing.status !== 'cancelled' && existing.status !== 'rejected') throw new ConflictException('您已报名或正在支付该活动')
    const occupied = await tx.eventEnrollment.count({ where: { eventId: event.id, status: { in: ['approved', 'pending_payment'] } } })
    if (occupied >= event.capacity) throw new ConflictException('活动名额已满，暂不支持在线付费报名')
    const user = await tx.user.findUniqueOrThrow({ where: { uid }, select: { uid: true, nickname: true, realName: true, phone: true, identities: { select: { type: true, enterpriseName: true } } } })
    const enterprise = user.identities.find((i) => i.type === 'community_enterprise' || i.type === 'external_enterprise')?.enterpriseName ?? ''
    const data = {
      eventId: event.id, userId: uid, name: user.realName || user.nickname, enterprise, phone: user.phone ?? '',
      message: (payload.message ?? '').trim() || null, appliedAt: formatNow(),
      status: 'pending_payment', waitlisted: false, waitlistOrder: null, checkedIn: false, checkInAt: null,
      checkinLat: null, checkinLng: null, checkinMethod: null, afterSalesFrozen: false,
    }
    if (existing) {
      await tx.eventEnrollment.update({ where: { id: existing.id }, data })
      return existing.id
    }
    const created = await tx.eventEnrollment.create({ data })
    return created.id
  }

  /* ---------------- 订单读取与状态 ---------------- */

  async orderDetail(uid: string, id: string) {
    const order = await this.loadOrder(uid, id)
    return (await this.orderViews([order]))[0]
  }

  private async loadOrder(uid: string, id: string): Promise<OrderWithBill> {
    const order = await this.db.commerceOrder.findUnique({
      where: { id },
      include: {
        bill: {
          include: {
            payments: { orderBy: { createdAt: 'desc' }, include: { refunds: { orderBy: { createdAt: 'desc' } } } },
          },
        },
      },
    })
    if (!order || order.createdBy !== uid) throw new NotFoundException('交易不存在')
    return order as OrderWithBill
  }

  private async orderViews(orders: OrderWithBill[]) {
    const redemptionIds = orders.map((o) => o.redemptionOrderId).filter((v): v is string => Boolean(v))
    const reservationIds = orders.map((o) => o.reservationId).filter((v): v is string => Boolean(v))
    const enrollmentIds = orders.map((o) => o.enrollmentId).filter((v): v is number => typeof v === 'number')
    const [redemptions, reservations, enrollments] = await Promise.all([
      redemptionIds.length ? this.db.redemptionOrder.findMany({ where: { id: { in: redemptionIds } } }) : Promise.resolve([]),
      reservationIds.length ? this.db.spaceReservation.findMany({ where: { id: { in: reservationIds } } }) : Promise.resolve([]),
      enrollmentIds.length ? this.db.eventEnrollment.findMany({ where: { id: { in: enrollmentIds } }, include: { event: true } }) : Promise.resolve([]),
    ])
    const redemptionMap = new Map(redemptions.map((r) => [r.id, r]))
    const reservationMap = new Map(reservations.map((r) => [r.id, r]))
    const enrollmentMap = new Map(enrollments.map((r) => [r.id, r]))
    const nowStr = formatNow()
    return Promise.all(orders.map((order) => this.buildOrderView(order, nowStr, {
      redemption: order.redemptionOrderId ? redemptionMap.get(order.redemptionOrderId) ?? null : null,
      reservation: order.reservationId ? reservationMap.get(order.reservationId) ?? null : null,
      enrollment: order.enrollmentId != null ? enrollmentMap.get(order.enrollmentId) ?? null : null,
    })))
  }

  private async buildOrderView(
    order: OrderWithBill,
    nowStr: string,
    benefitRows: { redemption: { id: string; goodsName: string; status: string; voucherCode: string; voucherExpiresAt: string; amountFen: number } | null; reservation: { id: string; spaceName: string; status: string; date: string; startTime: string; endTime: string } | null; enrollment: { id: number; status: string; checkedIn: boolean; event: { title: string; startTime: string; endTime: string; status: string } } | null },
  ) {
    const payments = order.bill?.payments ?? []
    const latestPayment = payments[0] ?? null
    const latestRefund = payments.flatMap((p) => p.refunds).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    /* 未付款订单不暴露券码/预约/电子票等权益，避免用户在付款前误以为可用。 */
    const benefit = order.paymentStatus === 'paid' ? this.benefitView(order, benefitRows) : null
    const display = this.displayStatus(order, benefit, nowStr)
    const refund = this.refundEligibility(order, benefit, nowStr)
    const actions: string[] = []
    if (order.paymentStatus === 'unpaid' && order.expiresAt.getTime() > Date.now()) {
      actions.push('pay')
      if (latestPayment && latestPayment.status === 'pending') actions.push('sync')
      actions.push('cancel')
    } else if (order.paymentStatus === 'attention') {
      actions.push('sync')
    }
    if (refund.eligible) actions.push('refund')
    if (benefit && order.fulfillmentStatus !== 'cancelled') actions.push('viewBenefit')
    if (display.status === 'paid_pending' || display.status === 'exception') actions.push('contact')

    return {
      id: order.id,
      sourceType: order.sourceType,
      sourceId: order.sourceId,
      sourceName: order.sourceName,
      title: order.sourceName,
      buyerType: order.buyerType,
      buyerId: order.buyerId,
      buyerName: order.buyerName,
      quantity: order.quantity,
      unitPriceFen: order.unitPriceFen,
      amountFen: order.amountFen,
      paidFen: order.paidFen,
      refundedFen: order.refundedFen,
      paymentStatus: order.paymentStatus,
      approvalStatus: order.approvalStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      afterSalesStatus: order.afterSalesStatus,
      status: display.status,
      statusText: display.text,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      expiresAt: order.expiresAt,
      closedAt: order.closedAt,
      fulfilledAt: order.fulfilledAt,
      serverTime: new Date().toISOString(),
      snapshot: order.snapshot,
      refundPolicy: (order.snapshot as { refundPolicy?: string } | null)?.refundPolicy ?? '',
      latestPayment: latestPayment ? { id: latestPayment.id, method: latestPayment.method, status: latestPayment.status, expiresAt: latestPayment.expiresAt } : null,
      latestRefund: latestRefund ? { id: latestRefund.id, status: latestRefund.status, amountFen: latestRefund.amountFen, reason: latestRefund.reason, createdAt: latestRefund.createdAt } : null,
      benefit,
      allowedActions: actions,
      refundEligible: refund.eligible,
      refundBlockedReason: refund.reason,
    }
  }

  private benefitView(order: OrderWithBill, rows: { redemption: { id: string; goodsName: string; status: string; voucherCode: string; voucherExpiresAt: string } | null; reservation: { id: string; spaceName: string; status: string; date: string; startTime: string; endTime: string } | null; enrollment: { id: number; status: string; checkedIn: boolean; event: { title: string; startTime: string; endTime: string; status: string } } | null }): BenefitView | null {
    if (order.sourceType === 'mall' && rows.redemption) {
      return {
        type: 'voucher', id: rows.redemption.id, title: rows.redemption.goodsName, status: rows.redemption.status,
        voucherCode: rows.redemption.voucherCode, voucherExpiresAt: rows.redemption.voucherExpiresAt,
        link: `/me/orders/${rows.redemption.id}`, completed: rows.redemption.status === 'finished',
      }
    }
    if (order.sourceType === 'space' && rows.reservation) {
      const ended = `${rows.reservation.date} ${rows.reservation.endTime}` < formatNow()
      return {
        type: 'reservation', id: rows.reservation.id, title: rows.reservation.spaceName, status: rows.reservation.status,
        date: rows.reservation.date, startTime: rows.reservation.startTime, endTime: rows.reservation.endTime,
        link: `/me/reservations/${rows.reservation.id}`, completed: rows.reservation.status === 'cancelled' || ended,
      }
    }
    if (order.sourceType === 'event' && rows.enrollment) {
      const ended = rows.enrollment.event.status === 'ended' || rows.enrollment.event.endTime < formatNow()
      return {
        type: 'ticket', id: String(rows.enrollment.id), title: rows.enrollment.event.title, status: rows.enrollment.status,
        checkedIn: rows.enrollment.checkedIn, eventStartTime: rows.enrollment.event.startTime, eventStatus: rows.enrollment.event.status,
        link: '/me/enrollments', completed: rows.enrollment.checkedIn || ended,
      }
    }
    if (order.sourceType === 'lease_bill') {
      return { type: 'bill', id: order.billId ?? order.id, title: order.sourceName, status: order.bill?.status ?? order.paymentStatus, link: '/me/leases', completed: order.paymentStatus === 'paid' }
    }
    return null
  }

  private displayStatus(order: CommerceOrder, benefit: BenefitView | null, nowStr: string): { status: string; text: string } {
    if (order.paymentStatus === 'paid') {
      if (order.afterSalesStatus === 'refunded') return { status: 'refunded', text: '已退款' }
      if (order.afterSalesStatus === 'requested' || order.afterSalesStatus === 'processing') return { status: 'refunding', text: '退款处理中' }
      if (order.afterSalesStatus === 'exception') return { status: 'exception', text: '退款需人工处理' }
      if (order.fulfillmentStatus === 'cancelled') return { status: 'closed', text: '已关闭' }
      if (order.fulfillmentStatus === 'exception') return { status: 'paid_pending', text: '已付款，待处理' }
      if (benefit?.eventStatus === 'cancelled') return { status: 'cancelled', text: '活动已取消' }
      if (benefit?.completed) return { status: 'completed', text: '已完成' }
      if (order.fulfillmentStatus === 'pending') return { status: 'paid_pending', text: '已付款，权益准备中' }
      if (order.sourceType === 'mall' && benefit?.voucherExpiresAt && benefit.voucherExpiresAt < nowStr) return { status: 'expired', text: '已过期' }
      return { status: 'active', text: order.sourceType === 'lease_bill' ? '已缴费' : '待使用' }
    }
    if (order.paymentStatus === 'attention') return { status: 'attention', text: '资金结果待核对' }
    if (order.paymentStatus === 'closed' || order.expiresAt.getTime() <= Date.now()) return { status: 'closed', text: '已关闭' }
    return { status: 'unpaid', text: '待付款' }
  }

  private refundEligibility(order: CommerceOrder, benefit: BenefitView | null, nowStr: string): { eligible: boolean; reason: string | null } {
    if (order.paymentStatus !== 'paid') return { eligible: false, reason: '仅已支付订单可申请退款' }
    if (!['none', 'rejected'].includes(order.afterSalesStatus)) return { eligible: false, reason: '退款申请正在处理中' }
    if (order.fulfillmentStatus === 'exception') return { eligible: true, reason: null }
    /* 已付款但履约尚未开始时退款安全：尚未核销/签到/使用。 */
    if (order.fulfillmentStatus === 'pending') return { eligible: true, reason: null }
    if (order.sourceType === 'lease_bill') return { eligible: false, reason: '租约账单退款请联系运营处理' }
    if (!benefit) return { eligible: false, reason: '权益记录缺失，请联系运营' }
    if (order.sourceType === 'mall') {
      if (benefit.status !== 'pending_use') return { eligible: false, reason: '券码已使用、已作废或不可退款' }
      if (benefit.voucherExpiresAt && benefit.voucherExpiresAt < nowStr) return { eligible: false, reason: '券码已过期，请联系运营处理' }
      return { eligible: true, reason: null }
    }
    if (order.sourceType === 'space') {
      if (benefit.status !== 'approved') return { eligible: false, reason: '预约状态不可退款' }
      if (benefit.date && `${benefit.date} ${benefit.startTime}` <= nowStr) return { eligible: false, reason: '预约已开始，不可退款' }
      return { eligible: true, reason: null }
    }
    if (order.sourceType === 'event') {
      /* 活动取消时报名会被同步取消，仍需保留原路退款入口。 */
      if (benefit.eventStatus === 'cancelled') return { eligible: true, reason: null }
      if (benefit.status !== 'approved') return { eligible: false, reason: '报名状态不可退款' }
      if (benefit.checkedIn) return { eligible: false, reason: '已签到，不可退款' }
      if (benefit.eventStartTime && benefit.eventStartTime <= nowStr) return { eligible: false, reason: '活动已开始，不可退款' }
      return { eligible: true, reason: null }
    }
    return { eligible: false, reason: '该业务暂不支持在线退款' }
  }

  /* ---------------- 支付 ---------------- */

  async startPayment(uid: string, orderId: string, dto: PayOrderDto, context: { userAgent: string; ip: string }) {
    const order = await this.loadOrder(uid, orderId)
    if (order.paymentStatus === 'paid') throw new ConflictException('订单已支付')
    if (order.paymentStatus === 'attention') throw new ConflictException('原支付结果待人工核对，禁止重复付款')
    if (order.paymentStatus !== 'unpaid') throw new ConflictException('订单已关闭，请重新选择')
    if (order.expiresAt.getTime() <= Date.now()) throw new ConflictException('订单已超过付款时限，请重新选择')
    if (!order.billId) throw new ConflictException('订单账单缺失，请联系运营')
    await this.assertModuleOpen(order.sourceType as CreateQuoteDto['sourceType'])
    await this.wx.assertCanCreate()

    const environment = detectEnvironment(context.userAgent)
    const method = dto.method ?? (environment === 'wechat' ? 'jsapi' : environment === 'mobile' ? 'h5' : 'native')
    assertMethodAllowed(environment, method)

    const settings = await this.wx.webOAuthSettings()
    let openid: string | undefined
    if (method === 'jsapi') {
      if (!settings.ready) throw new ServiceUnavailableException(settings.reason || '微信网页授权尚未完成配置')
      const binding = await this.db.wechatUserBinding.findUnique({ where: { userId_appid: { userId: uid, appid: settings.appid } } })
      if (!binding) return { requiresAuthorization: true, method: 'jsapi' as const, orderId }
      openid = binding.openid
    }
    const launch: AppPaymentLaunch = await this.payments.appPayment({
      billId: order.billId,
      method,
      openid,
      ip: context.ip,
      title: order.sourceName,
      returnUrl: settings.clientBase ? `${settings.clientBase}/checkout/${orderId}/result` : undefined,
    })
    return { ...launch, orderId }
  }

  async syncPayment(uid: string, paymentId: string) {
    const payment = await this.db.commercePayment.findUnique({
      where: { id: paymentId },
      include: { bill: { include: { order: { select: { id: true, createdBy: true } } } } },
    })
    if (!payment?.bill?.order || payment.bill.order.createdBy !== uid) throw new NotFoundException('支付单不存在')
    await this.payments.syncPayment(paymentId)
    return this.orderDetail(uid, payment.bill.order.id)
  }

  async cancelOrder(uid: string, orderId: string) {
    const order = await this.loadOrder(uid, orderId)
    if (order.paymentStatus === 'paid') throw new ConflictException('已支付订单不能取消，请申请退款')
    if (order.paymentStatus === 'attention') throw new ConflictException('支付结果待人工核对，暂不能取消')
    if (order.fulfillmentStatus === 'cancelled') return this.orderDetail(uid, orderId)
    if (order.billId) await this.payments.closePendingForBill(order.billId)
    const released = await this.db.$transaction((tx) => this.fulfillment.releaseUnpaid(tx, order.id, '用户取消未支付订单'))
    if (!released) throw new ConflictException('订单状态已变化，请刷新后重试')
    return this.orderDetail(uid, orderId)
  }

  async authorizeUrl(uid: string, orderId: string) {
    const order = await this.loadOrder(uid, orderId)
    if (order.paymentStatus !== 'unpaid' || order.expiresAt.getTime() <= Date.now()) throw new ConflictException('订单当前不可支付')
    const settings = await this.wx.webOAuthSettings()
    if (!settings.ready || !settings.appid) throw new ServiceUnavailableException(settings.reason || '微信网页授权尚未完成配置')
    const ticket = randomBytes(24).toString('hex')
    await this.redis.setCache(oauthTicketKey(ticket), { uid, orderId, appid: settings.appid }, OAUTH_TICKET_TTL)
    return { url: `${settings.base}/api/app/commerce/wechat/oauth/start?ticket=${ticket}` }
  }

  /* ---------------- 微信网页授权 ---------------- */

  async oauthStart(ticket: string) {
    const key = oauthTicketKey(ticket)
    /* 原子消费：同一 ticket 并发请求只能有一个进入微信授权。 */
    const data = await this.redis.takeCache<{ uid: string; orderId: string; appid: string }>(key)
    if (!data) throw new BadRequestException('授权链接已失效，请重新发起支付')
    const settings = await this.wx.webOAuthSettings()
    if (!settings.ready || settings.appid !== data.appid) throw new ServiceUnavailableException(settings.reason || '微信网页授权尚未完成配置')
    const state = randomBytes(24).toString('hex')
    await this.redis.setCache(oauthStateKey(state), data, OAUTH_TICKET_TTL)
    const redirect = encodeURIComponent(`${settings.base}/api/app/commerce/wechat/oauth/callback`)
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${settings.appid}&redirect_uri=${redirect}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`
  }

  async oauthCallback(code: string, state: string) {
    const key = oauthStateKey(state)
    /* state 单次消费：授权回调重复/伪造时不会重复绑定或重放。 */
    const data = await this.redis.takeCache<{ uid: string; orderId: string; appid: string }>(key)
    if (!data) throw new BadRequestException('授权状态已失效，请重新发起支付')
    const settings = await this.wx.webOAuthSettings()
    const failUrl = settings.clientBase ? `${settings.clientBase}/checkout/${data.orderId}?payAuth=fail` : null
    if (!settings.ready || !settings.appSecret || settings.appid !== data.appid || !code) return failUrl
    try {
      const endpoint = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
      endpoint.searchParams.set('appid', settings.appid)
      endpoint.searchParams.set('secret', settings.appSecret)
      endpoint.searchParams.set('code', code)
      endpoint.searchParams.set('grant_type', 'authorization_code')
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) })
      const body = (await response.json()) as { openid?: string; unionid?: string; errcode?: number }
      if (!response.ok || !body.openid) throw new Error('微信授权未返回 OpenID')
      await this.db.$transaction(async (tx) => {
        const other = await tx.wechatUserBinding.findUnique({ where: { appid_openid: { appid: settings.appid, openid: body.openid! } } })
        if (other && other.userId !== data.uid) await tx.wechatUserBinding.delete({ where: { id: other.id } })
        await tx.wechatUserBinding.upsert({
          where: { userId_appid: { userId: data.uid, appid: settings.appid } },
          create: { id: await this.ids.next('WB', tx), userId: data.uid, appid: settings.appid, openid: body.openid!, unionid: body.unionid ?? null },
          update: { openid: body.openid!, unionid: body.unionid ?? null },
        })
      })
      return settings.clientBase ? `${settings.clientBase}/checkout/${data.orderId}?payAuth=ok` : null
    } catch (e) {
      this.logger.warn(`微信网页授权失败 ${data.orderId}: ${e instanceof Error ? e.message : String(e)}`)
      return failUrl
    }
  }

  /* ---------------- 交易列表 ---------------- */

  async transactions(uid: string, query: TransactionQueryDto) {
    const now = new Date()
    const where: Prisma.CommerceOrderWhereInput = { createdBy: uid }
    if (query.sourceType) where.sourceType = query.sourceType
    if (query.status === 'unpaid') {
      where.paymentStatus = 'unpaid'
      where.expiresAt = { gt: now }
    } else if (query.status === 'active') {
      where.paymentStatus = 'paid'
      where.afterSalesStatus = { in: ['none', 'rejected'] }
      where.fulfillmentStatus = { in: ['pending', 'ready'] }
    } else if (query.status === 'completed') {
      where.paymentStatus = 'paid'
      where.fulfillmentStatus = 'used'
    } else if (query.status === 'refund') {
      where.afterSalesStatus = { in: ['requested', 'processing', 'refunded', 'exception'] }
    } else if (query.status === 'closed') {
      where.OR = [
        { paymentStatus: { in: ['closed', 'attention'] } },
        { paymentStatus: 'unpaid', expiresAt: { lte: now } },
      ]
    }
    const [rows, total] = await this.db.$transaction([
      this.db.commerceOrder.findMany({
        where,
        include: { bill: { include: { payments: { orderBy: { createdAt: 'desc' }, include: { refunds: { orderBy: { createdAt: 'desc' } } } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.commerceOrder.count({ where }),
    ])
    return { list: await this.orderViews(rows as OrderWithBill[]), total, serverTime: new Date().toISOString() }
  }

  async transactionsSummary(uid: string) {
    const now = new Date()
    const [pendingPayment, refunding, unpaidBills] = await Promise.all([
      this.db.commerceOrder.count({ where: { createdBy: uid, paymentStatus: 'unpaid', expiresAt: { gt: now } } }),
      this.db.commerceOrder.count({ where: { createdBy: uid, afterSalesStatus: { in: ['requested', 'processing'] } } }),
      this.countUnpaidBills(uid),
    ])
    return { pendingPayment, refunding, unpaidBills }
  }

  /* ---------------- 租约账单 ---------------- */

  private async enterpriseIds(uid: string) {
    const rows = await this.db.enterprise.findMany({ where: { contactUserId: uid, deletedAt: null, status: 'active' }, select: { id: true } })
    return rows.map((r) => r.id)
  }

  private async assertBillAccess(uid: string, bill: CommerceBill) {
    if (bill.buyerType === 'user' && bill.buyerId === uid) return
    if (bill.buyerType === 'enterprise') {
      const ids = await this.enterpriseIds(uid)
      if (ids.includes(bill.buyerId)) return
    }
    throw new NotFoundException('账单不存在')
  }

  private async billWhere(uid: string): Promise<Prisma.CommerceBillWhereInput> {
    const ids = await this.enterpriseIds(uid)
    return {
      status: 'unpaid',
      OR: [
        { buyerType: 'user', buyerId: uid },
        ...(ids.length ? [{ buyerType: 'enterprise', buyerId: { in: ids } }] : []),
      ],
    }
  }

  private async countUnpaidBills(uid: string) {
    return this.db.commerceBill.count({ where: await this.billWhere(uid) })
  }

  async bills(uid: string, query: BillQueryDto) {
    const where = await this.billWhere(uid)
    const [rows, total, sum] = await Promise.all([
      this.db.commerceBill.findMany({ where, orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.db.commerceBill.count({ where }),
      this.db.commerceBill.aggregate({ where, _sum: { amountFen: true, paidFen: true } }),
    ])
    const today = formatToday()
    return {
      list: rows.map((b) => ({
        id: b.id, title: b.title, sourceId: b.sourceId, sourceName: b.sourceName, module: b.module, period: b.period,
        amountFen: b.amountFen, paidFen: b.paidFen, dueFen: b.amountFen - b.paidFen, dueDate: b.dueDate,
        overdue: b.dueDate < today, buyerType: b.buyerType, buyerName: b.buyerName,
      })),
      total,
      totalDueFen: (sum._sum.amountFen ?? 0) - (sum._sum.paidFen ?? 0),
      serverTime: new Date().toISOString(),
    }
  }

  async createBillOrder(uid: string, billId: string) {
    await this.assertModuleOpen('lease_bill')
    const orderId = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CommerceBill" WHERE id = ${billId} FOR UPDATE`
      const bill = await tx.commerceBill.findUnique({ where: { id: billId }, include: { order: true, receipts: true } })
      if (!bill) throw new NotFoundException('账单不存在')
      await this.assertBillAccess(uid, bill)
      if (bill.status !== 'unpaid') throw new ConflictException('账单已支付或已作废')
      if (bill.paidFen > 0) throw new ConflictException('账单存在部分收款，请联系运营')
      if (bill.receipts.some((r) => r.status === 'pending')) throw new ConflictException('账单存在待复核收款，请联系运营')
      if (bill.order) {
        if (bill.order.paymentStatus === 'paid') throw new ConflictException('账单已支付')
        if (bill.order.afterSalesStatus === 'requested' || bill.order.afterSalesStatus === 'processing') throw new ConflictException('账单正在售后处理中')
        await tx.commerceOrder.update({
          where: { id: bill.order.id },
          data: { paymentStatus: 'unpaid', fulfillmentStatus: 'pending', closedAt: null, lastError: null, expiresAt: new Date(Date.now() + PAY_TTL_MS) },
        })
        return bill.order.id
      }
      const orderId = `CO${randomBytes(14).toString('hex')}`
      const amountFen = bill.amountFen - bill.paidFen
      await tx.commerceOrder.create({
        data: {
          id: orderId, billId: bill.id, sourceType: 'lease_bill', sourceId: bill.sourceId, sourceName: bill.title,
          buyerType: bill.buyerType, buyerId: bill.buyerId, buyerName: bill.buyerName, createdBy: uid,
          quantity: 1, unitPriceFen: amountFen, amountFen,
          snapshot: {
            title: bill.title, subtitle: '租约账单 · 在线缴费',
            lines: [
              { label: '账期', value: bill.period },
              { label: '购买主体', value: bill.buyerName },
              { label: '到期日期', value: bill.dueDate },
            ],
            refundPolicy: '按租约约定执行，退款请联系运营处理。',
            notes: ['缴费成功后不会自动改变租期、办公位分配或生成续租合同。'],
            sourceLink: '/me/leases',
          },
          expiresAt: new Date(Date.now() + PAY_TTL_MS),
        },
      })
      return orderId
    })
    return this.orderDetail(uid, orderId)
  }

  /* ---------------- 退款 ---------------- */

  async requestRefund(uid: string, orderId: string, dto: RefundRequestDto) {
    const order = await this.loadOrder(uid, orderId)
    if (order.paymentStatus !== 'paid') throw new BadRequestException('仅已支付订单可申请退款')
    if (!['none', 'rejected'].includes(order.afterSalesStatus)) throw new ConflictException('退款申请正在处理中，请勿重复提交')
    const payment = order.bill?.payments.find((p) => p.status === 'success')
    if (!payment) throw new ConflictException('未找到成功支付记录，请联系运营')
    const benefit = this.benefitView(order, await this.loadBenefitRows([order]).then((m) => m[order.id] ?? { redemption: null, reservation: null, enrollment: null }))
    const eligibility = this.refundEligibility(order, benefit, formatNow())
    if (!eligibility.eligible) throw new BadRequestException(eligibility.reason || '当前订单不可申请退款')
    const refund = await this.payments.requestRefund(payment.id, { amountFen: order.amountFen, reason: dto.reason.trim() }, `app:${uid}`)
    return { id: refund.id, status: refund.status, amountFen: refund.amountFen }
  }

  async refundDetail(uid: string, id: string) {
    const refund = await this.db.commerceRefund.findUnique({
      where: { id },
      include: { payment: { include: { bill: { include: { order: true } } } } },
    })
    if (!refund || refund.payment.bill?.order?.createdBy !== uid) throw new NotFoundException('退款申请不存在')
    const status = refund.status
    const display = refundDisplay(status)
    return {
      id: refund.id,
      orderId: refund.payment.bill.order.id,
      amountFen: refund.amountFen,
      reason: refund.reason,
      status,
      statusText: display.text,
      createdAt: refund.createdAt,
      completedAt: refund.completedAt,
      timeline: [
        { at: refund.createdAt, title: '退款申请已提交', text: '等待运营审核' },
        ...(status === 'rejected' ? [{ at: null, title: '退款申请未通过', text: '如有疑问请联系运营' }] : []),
        ...(['processing', 'success', 'closed', 'abnormal', 'attention'].includes(status) ? [{ at: null, title: '审核已通过', text: '微信退款处理中' }] : []),
        ...(status === 'success' ? [{ at: refund.completedAt, title: '退款成功', text: '资金已按原支付方式退回' }] : []),
        ...(['closed', 'abnormal', 'attention'].includes(status) ? [{ at: null, title: '退款异常', text: '需人工处理，请保留申请编号并联系运营' }] : []),
      ],
      serverTime: new Date().toISOString(),
    }
  }

  /* ---------------- 定时关闭 ---------------- */

  /** 已结束的空间预约/活动订单转「已完成」：仅状态展示，不改变资金或权益。 */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'app-commerce-complete-ended' })
  async completeEndedOrders() {
    const now = formatNow()
    const spaceOrders = await this.db.commerceOrder.findMany({
      where: { sourceType: 'space', paymentStatus: 'paid', fulfillmentStatus: 'ready', reservationId: { not: null } },
      take: 50, select: { id: true, reservationId: true },
    })
    for (const order of spaceOrders) {
      const reservation = await this.db.spaceReservation.findUnique({ where: { id: order.reservationId! }, select: { date: true, endTime: true, status: true } })
      if (reservation && reservation.status === 'approved' && `${reservation.date} ${reservation.endTime}` <= now) {
        await this.db.commerceOrder.updateMany({ where: { id: order.id, fulfillmentStatus: 'ready' }, data: { fulfillmentStatus: 'used' } })
      }
    }
    const eventOrders = await this.db.commerceOrder.findMany({
      where: { sourceType: 'event', paymentStatus: 'paid', fulfillmentStatus: 'ready', enrollmentId: { not: null } },
      take: 50, select: { id: true, enrollmentId: true },
    })
    for (const order of eventOrders) {
      const enrollment = await this.db.eventEnrollment.findUnique({ where: { id: order.enrollmentId! }, include: { event: { select: { endTime: true, status: true } } } })
      if (enrollment && (enrollment.checkedIn || enrollment.event.status === 'ended' || enrollment.event.endTime < now)) {
        await this.db.commerceOrder.updateMany({ where: { id: order.id, fulfillmentStatus: 'ready' }, data: { fulfillmentStatus: 'used' } })
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'app-commerce-order-expiry' })
  async closeExpiredOrders() {
    const rows = await this.db.commerceOrder.findMany({
      where: { paymentStatus: 'unpaid', expiresAt: { lte: new Date() } },
      orderBy: { expiresAt: 'asc' }, take: 20, select: { id: true, billId: true },
    })
    for (const row of rows) {
      try {
        if (row.billId) await this.payments.closePendingForBill(row.billId)
      } catch (e) {
        this.logger.warn(`超时订单暂不释放 ${row.id}: ${e instanceof Error ? e.message : String(e)}`)
        continue
      }
      try {
        await this.db.$transaction((tx) => this.fulfillment.releaseUnpaid(tx, row.id, '支付超时，订单已关闭'))
      } catch (e) {
        this.logger.warn(`超时订单释放失败 ${row.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  /* ---------------- 内部工具 ---------------- */

  private async loadBenefitRows(orders: OrderWithBill[]) {
    const redemptionIds = orders.map((o) => o.redemptionOrderId).filter((v): v is string => Boolean(v))
    const reservationIds = orders.map((o) => o.reservationId).filter((v): v is string => Boolean(v))
    const enrollmentIds = orders.map((o) => o.enrollmentId).filter((v): v is number => typeof v === 'number')
    const [redemptions, reservations, enrollments] = await Promise.all([
      redemptionIds.length ? this.db.redemptionOrder.findMany({ where: { id: { in: redemptionIds } } }) : Promise.resolve([]),
      reservationIds.length ? this.db.spaceReservation.findMany({ where: { id: { in: reservationIds } } }) : Promise.resolve([]),
      enrollmentIds.length ? this.db.eventEnrollment.findMany({ where: { id: { in: enrollmentIds } }, include: { event: true } }) : Promise.resolve([]),
    ])
    const redemptionMap = new Map(redemptions.map((r) => [r.id, r]))
    const reservationMap = new Map(reservations.map((r) => [r.id, r]))
    const enrollmentMap = new Map(enrollments.map((r) => [r.id, r]))
    const result: Record<string, { redemption: typeof redemptions[number] | null; reservation: typeof reservations[number] | null; enrollment: typeof enrollments[number] | null }> = {}
    for (const order of orders) {
      result[order.id] = {
        redemption: order.redemptionOrderId ? redemptionMap.get(order.redemptionOrderId) ?? null : null,
        reservation: order.reservationId ? reservationMap.get(order.reservationId) ?? null : null,
        enrollment: order.enrollmentId != null ? enrollmentMap.get(order.enrollmentId) ?? null : null,
      }
    }
    return result
  }

  private validateSpaceWindow(space: Pick<Space, 'openTime' | 'closeTime' | 'capacity'>, dto: CreateQuoteDto) {
    const date = (dto.date ?? '').trim()
    const start = (dto.start ?? '').trim()
    const end = (dto.end ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('预约日期格式应为 YYYY-MM-DD')
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new BadRequestException('预约时间格式应为 HH:mm')
    if (date < formatToday()) throw new BadRequestException('不能预约过去的日期')
    if (date === formatToday() && start <= formatNow().slice(11, 16)) throw new BadRequestException('不能预约已经过去的时段')
    if (start >= end) throw new BadRequestException('结束时间须晚于开始时间')
    if (start < space.openTime || end > space.closeTime) throw new BadRequestException(`可预约时段为 ${space.openTime}-${space.closeTime}`)
    const attendees = dto.attendees ?? 1
    if (attendees < 1 || attendees > space.capacity) throw new BadRequestException(`使用人数须为 1-${space.capacity} 人`)
    if (billableHours(start, end) <= 0) throw new BadRequestException('预约时段无效')
    return { date, start, end }
  }

  private async resolveSpaceSubject(tx: Prisma.TransactionClient, user: AppUser, dto: CreateQuoteDto) {
    const identityType = dto.asIdentity || (dto.asEnterpriseId ? 'community_enterprise' : 'individual')
    if (dto.asEnterpriseId) {
      const enterprise = await tx.enterprise.findUnique({ where: { id: dto.asEnterpriseId } })
      if (!enterprise) throw new NotFoundException('企业不存在')
      await assertEnterprisePermission(tx as unknown as PrismaService, user.uid, dto.asEnterpriseId, 'space_reserve')
      return { buyerType: 'enterprise' as const, buyerId: enterprise.id, buyerName: enterprise.name, identityType: 'community_enterprise' as const, subjectName: enterprise.name }
    }
    if (identityType === 'community_enterprise') throw new BadRequestException('请选择要代表的社区企业')
    const subjectName = identityType === 'individual'
      ? (user.realName || user.nickname)
      : user.identities.find((i) => i.type === identityType)?.enterpriseName || user.realName || user.nickname
    return { buyerType: 'user' as const, buyerId: user.uid, buyerName: user.nickname, identityType, subjectName }
  }

  private async assertSpaceFree(tx: Prisma.TransactionClient, space: Space, uid: string, date: string, start: string, end: string) {
    const reserved = await tx.spaceReservation.findMany({ where: { spaceId: space.id, date, status: { in: ['pending', 'pending_payment', 'approved'] }, deletedAt: null } })
    if (reserved.some((r) => r.startTime < end && start < r.endTime)) throw new ConflictException('该时段已被预约，请选择其他时间')
    const events = await tx.communityEvent.findMany({ where: { status: 'published', deletedAt: null } })
    if (events.some((e) => eventCoversDate(e, date) && eventOccupiesSpace(e, space) && eventBlocksWindow(e, date, start, end))) {
      throw new ConflictException('该时段已被活动占用，请选择其他时间')
    }
    const mine = await tx.spaceReservation.findFirst({ where: { userId: uid, spaceId: space.id, date, status: { in: ['pending', 'pending_payment', 'approved'] }, deletedAt: null, startTime: { lt: end }, endTime: { gt: start } } })
    if (mine) throw new ConflictException('你已预约该时段，请勿重复提交')
  }

  private async assertReservable(space: Space, user: AppUser, identityType: string) {
    const types = space.reservationIdentities
    const levels = space.reservationLevels
    if (types.length === 0 && levels.length === 0) return
    const level = identityType === 'individual' ? null : user.identities.find((i) => i.type === identityType)?.level ?? null
    const typeHit = types.length === 0 || types.includes(identityType)
    const levelHit = levels.length === 0 || (level != null && levels.includes(String(level)))
    if (!typeHit || !levelHit) throw new ForbiddenException('该空间不在你的可预约范围内')
  }

  private scopeMatches(identityTypes: string[], levels: string[], identities: Identity[]) {
    if (identityTypes.length === 0 && levels.length === 0) return true
    return identities.some((i) =>
      (identityTypes.length === 0 || identityTypes.includes(i.type)) &&
      (levels.length === 0 || (i.level != null && levels.includes(String(i.level)))),
    )
  }

  private canSeeGoods(goods: MallGoods, category: { status: string; visibilityIdentities: string[]; visibilityLevels: string[] } | null, identities: Identity[]) {
    if (!this.scopeMatches(goods.visibilityIdentities, goods.visibilityLevels, identities)) return false
    const code = (goods.category ?? '').trim()
    if (!code) return true
    return category != null && category.status === 'enabled' && this.scopeMatches(category.visibilityIdentities, category.visibilityLevels, identities)
  }

  private canOrderGoods(goods: MallGoods, category: { status: string; visibilityIdentities: string[]; visibilityLevels: string[]; orderIdentities: string[]; orderLevels: string[] } | null, identities: Identity[]) {
    return this.canSeeGoods(goods, category, identities)
      && this.scopeMatches(goods.orderIdentities, goods.orderLevels, identities)
      && this.scopeMatches(category?.orderIdentities ?? [], category?.orderLevels ?? [], identities)
  }
}

/* ---------------- 纯函数工具 ---------------- */

function detectEnvironment(userAgent: string): 'wechat' | 'mobile' | 'desktop' {
  if (/MicroMessenger/i.test(userAgent)) return 'wechat'
  if (/Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

function assertMethodAllowed(environment: 'wechat' | 'mobile' | 'desktop', method: AppPayMethod) {
  if (environment === 'wechat' && method !== 'jsapi') throw new BadRequestException('微信内请使用微信支付')
  if (environment === 'mobile' && method !== 'h5') throw new BadRequestException('当前浏览器请使用 H5 支付')
  if (environment === 'desktop' && method !== 'native') throw new BadRequestException('桌面浏览器请使用扫码支付')
}

function refundDisplay(status: string): { text: string } {
  if (status === 'pending') return { text: '申请已提交，等待审核' }
  if (status === 'processing') return { text: '退款处理中' }
  if (status === 'success') return { text: '退款成功' }
  if (status === 'rejected') return { text: '申请未通过' }
  if (status === 'closed') return { text: '退款已关闭，需人工处理' }
  return { text: '退款异常，需人工处理' }
}

function oauthTicketKey(ticket: string) { return `app:oauth:ticket:${ticket}` }
function oauthStateKey(state: string) { return `app:oauth:state:${state}` }
function fenText(fen: number) { return (fen / 100).toFixed(2) }
