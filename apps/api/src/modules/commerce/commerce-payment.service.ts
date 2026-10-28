import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CommercePayment } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { formatNow } from '../../common/utils/time'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { PrismaService } from '../../common/prisma/prisma.service'
import { WechatApiError, WechatPayClient, WechatTransaction } from './wechat-pay.client'
import { RefundCommerceDto } from './commerce.dto'

@Injectable()
export class CommercePaymentService {
  private readonly logger = new Logger(CommercePaymentService.name)
  constructor(private readonly db: PrismaService, private readonly wx: WechatPayClient, private readonly ids: IdGeneratorService) {}

  async nativePayment(billId: string) {
    const payment = await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('wechatpay-config'))`
      const config = await this.wx.assertCanCreate(tx)
      await tx.$queryRaw`SELECT id FROM "CommerceBill" WHERE id = ${billId} FOR UPDATE`
      const bill = await tx.commerceBill.findUnique({ where: { id: billId }, include: { payments: { orderBy: { createdAt: 'desc' } }, receipts: true } })
      if (!bill) throw new NotFoundException('账单不存在')
      if (bill.status !== 'unpaid' || bill.paidFen || bill.receipts.some(x => x.status === 'pending')) throw new ConflictException('账单已收款、已作废或存在待复核收款')
      const existing = bill.payments.find(x => ['pending', 'attention'].includes(x.status))
      if (existing) {
        if (existing.status === 'attention') throw new ConflictException('原支付结果待人工复核，禁止重复付款')
        if (existing.appid !== config.appid || existing.mchid !== config.mchid) throw new ConflictException('商户配置已变化，请先处理原支付单')
        return { ...existing, title: bill.title }
      }
      if (bill.payments.some(x => x.status === 'success')) throw new ConflictException('账单已有成功付款')
      const created = await tx.commercePayment.create({ data: { id: `CP${randomBytes(14).toString('hex')}`, billId, amountFen: bill.amountFen, appid: config.appid, mchid: config.mchid, method: 'native', expiresAt: new Date(Date.now() + 15 * 60000), prepay: { title: bill.title, notifyUrl: `${config.base}/api/payment-notifications/wechat/payment` } } })
      return { ...created, title: bill.title }
    })
    if (payment.expiresAt.getTime() <= Date.now()) { await this.syncPayment(payment.id); throw new ConflictException('原支付已到期，正在确认或关闭，请稍后重新发起') }
    const snapshot = payment.prepay as { title?: string; notifyUrl?: string; code_url?: string } | null
    if (snapshot?.code_url) return { id: payment.id, expiresAt: payment.expiresAt, code_url: snapshot.code_url }
    try {
      // Always reuse this persisted merchant order number, including after an ambiguous timeout.
      const result = await this.wx.prepay({ id: payment.id, amountFen: payment.amountFen, title: snapshot?.title ?? payment.title, notifyUrl: snapshot?.notifyUrl, expiresAt: payment.expiresAt, method: 'native' })
      if (!result.code_url?.startsWith('weixin://')) throw new ServiceUnavailableException('支付二维码结果无效')
      await this.db.commercePayment.update({ where: { id: payment.id }, data: { prepay: { ...snapshot, code_url: result.code_url } } })
      return { id: payment.id, expiresAt: payment.expiresAt, code_url: result.code_url }
    } catch (e) {
      await this.db.commercePayment.update({ where: { id: payment.id }, data: { lastError: '下单结果待确认，请通过原支付单查询', nextCheckAt: new Date() } })
      throw e
    }
  }

  private async assertMerchant(payment: CommercePayment) {
    const c = await this.wx.credentials()
    if (payment.mchid !== c.mchid || payment.appid !== c.appid) throw new ConflictException('原交易商户与当前配置不一致，禁止使用新配置处理历史资金')
  }

  async confirmPayment(data: WechatTransaction) {
    if (data.trade_state !== 'SUCCESS') return
    const payment = await this.db.commercePayment.findUnique({ where: { id: data.out_trade_no } })
    if (!payment) throw new NotFoundException('支付单不存在')
    if (data.appid !== payment.appid || data.mchid !== payment.mchid || data.amount?.total !== payment.amountFen || data.amount?.currency !== 'CNY' || !data.transaction_id) throw new BadRequestException('支付结果与本地订单不匹配')
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "CommerceBill" WHERE id = ${payment.billId} FOR UPDATE`
      const current = await tx.commercePayment.findUniqueOrThrow({ where: { id: payment.id } })
      if (current.status === 'success') {
        if (current.transactionId !== data.transaction_id) throw new ConflictException('渠道交易号不一致')
        return
      }
      const updated = await tx.commerceBill.updateMany({ where: { id: payment.billId, status: 'unpaid', paidFen: 0 }, data: { status: 'paid', paidFen: payment.amountFen } })
      if (!updated.count) throw new ConflictException('已收到付款但账单状态冲突，请人工核对')
      await tx.commercePayment.update({ where: { id: payment.id }, data: { status: 'success', transactionId: data.transaction_id, paidAt: data.success_time ? new Date(data.success_time) : new Date(), checkedAt: new Date(), lastError: null } })
      await tx.auditLog.create({ data: { id: await this.ids.next('AL', tx), module: '交易经营', action: '确认微信收款', target: payment.billId, detail: `${payment.id}；${payment.amountFen} 分`, operator: '系统', at: formatNow() } })
    })
  }

  async syncPayment(id: string) {
    const payment = await this.db.commercePayment.findUnique({ where: { id } })
    if (!payment) throw new NotFoundException('支付单不存在')
    if (!['pending', 'attention'].includes(payment.status)) return payment
    await this.assertMerchant(payment)
    try {
      const result = await this.wx.query(id)
      if (result.out_trade_no !== id || result.mchid !== payment.mchid || result.appid !== payment.appid) throw new BadRequestException('查询结果不匹配')
      if (result.trade_state === 'SUCCESS') await this.confirmPayment(result)
      else if (result.trade_state === 'CLOSED') await this.db.commercePayment.updateMany({ where: { id, status: { in: ['pending', 'attention'] } }, data: { status: 'closed', checkedAt: new Date() } })
      else if (payment.expiresAt.getTime() <= Date.now() && result.trade_state === 'NOTPAY') {
        await this.wx.close(id)
        await this.db.commercePayment.updateMany({ where: { id, status: { in: ['pending', 'attention'] } }, data: { status: 'closed', checkedAt: new Date() } })
      }
      await this.db.commercePayment.update({ where: { id }, data: { nextCheckAt: new Date(Date.now() + 60000), attempts: { increment: 1 }, checkedAt: new Date(), lastError: null } })
      if (payment.attempts >= 119) await this.db.commercePayment.updateMany({ where: { id, status: 'pending' }, data: { status: 'attention', lastError: '自动核实达到次数上限，请人工核对；禁止重复付款' } })
    } catch (e) {
      // ORDER_NOT_EXIST is an authoritative absence only after our creation window has ended.
      if (e instanceof WechatApiError && e.code === 'ORDER_NOT_EXIST' && payment.expiresAt.getTime() <= Date.now()) {
        await this.db.commercePayment.updateMany({ where: { id, status: { in: ['pending', 'attention'] } }, data: { status: 'closed', checkedAt: new Date() } })
      } else {
        await this.db.commercePayment.updateMany({ where: { id, status: { in: ['pending', 'attention'] } }, data: { ...(payment.attempts >= 119 ? { status: 'attention' } : {}), nextCheckAt: new Date(Date.now() + Math.min(3600000, 60000 * (payment.attempts + 1))), attempts: { increment: 1 }, lastError: '支付状态核实失败，需继续查询或人工处理' } })
        throw e
      }
    }
    return this.db.commercePayment.findUniqueOrThrow({ where: { id } })
  }

  async requestRefund(id: string, dto: RefundCommerceDto, actor: string) {
    const payment = await this.db.commercePayment.findUnique({ where: { id } })
    if (!payment || payment.status !== 'success') throw new BadRequestException('仅已确认付款可申请退款')
    if (dto.amountFen !== payment.amountFen) throw new BadRequestException('本阶段仅支持整单全额退款')
    await this.assertMerchant(payment)
    // Refunds are not created from a client claimed successful status.
    const actual = await this.wx.query(id)
    if (!['SUCCESS', 'REFUND'].includes(actual.trade_state) || actual.transaction_id !== payment.transactionId || actual.out_trade_no !== id || actual.amount?.total !== payment.amountFen || actual.mchid !== payment.mchid || actual.appid !== payment.appid) throw new ConflictException('渠道付款状态待核对')
    if (payment.paidAt && Date.now() - payment.paidAt.getTime() > 365 * 86400000) throw new BadRequestException('已超过渠道退款期限，请联系财务处理')
    if (!dto.reason.trim()) throw new BadRequestException('退款原因不能为空')
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "CommerceBill" WHERE id = ${payment.billId} FOR UPDATE`
      const reserved = await tx.commerceRefund.aggregate({ where: { paymentId: id, status: { notIn: ['rejected', 'closed'] } }, _sum: { amountFen: true } })
      if (dto.amountFen + (reserved._sum.amountFen ?? 0) > payment.amountFen) throw new ConflictException('退款金额超过可退额度（含处理中退款）')
      const refund = await tx.commerceRefund.create({ data: { id: `RF${randomBytes(14).toString('hex')}`, paymentId: id, amountFen: dto.amountFen, reason: dto.reason.trim(), createdBy: actor } })
      await tx.auditLog.create({ data: { id: await this.ids.next('AL', tx), module: '交易经营', action: '申请微信退款', target: refund.id, detail: `${dto.amountFen} 分`, operator: actor, at: formatNow() } })
      return refund
    })
  }

  async approveRefund(id: string, actor: string) {
    const refund = await this.db.commerceRefund.findUnique({ where: { id }, include: { payment: true } })
    if (!refund) throw new NotFoundException('退款单不存在')
    if (refund.createdBy === actor) throw new ConflictException('请由另一位有审批权限的管理员审批退款')
    await this.assertMerchant(refund.payment)
    await this.db.$transaction(async tx => {
      const changed = await tx.commerceRefund.updateMany({ where: { id, status: 'pending' }, data: { status: 'processing', approvedBy: actor, nextCheckAt: new Date() } })
      if (!changed.count) throw new ConflictException('退款单已处理')
      await tx.auditLog.create({ data: { id: await this.ids.next('AL', tx), module: '交易经营', action: '审批微信退款', target: id, operator: actor, at: formatNow() } })
    })
    // Persist before calling the channel; a crash is recovered by the background worker.
    return this.syncRefund(id)
  }

  async rejectRefund(id: string, actor: string) {
    return this.db.$transaction(async tx => {
      const refund = await tx.commerceRefund.findUnique({ where: { id } })
      if (!refund) throw new NotFoundException('退款单不存在')
      if (refund.createdBy === actor) throw new ConflictException('请由另一位审批人处理申请')
      const changed = await tx.commerceRefund.updateMany({ where: { id, status: 'pending' }, data: { status: 'rejected', approvedBy: actor } })
      if (!changed.count) throw new ConflictException('仅待审批退款可驳回')
      await tx.auditLog.create({ data: { id: await this.ids.next('AL', tx), module: '交易经营', action: '驳回微信退款', target: id, operator: actor, at: formatNow() } })
      return { code: 0 }
    })
  }

  async syncRefund(id: string) {
    const refund = await this.db.commerceRefund.findUniqueOrThrow({ where: { id }, include: { payment: true } })
    if (!['processing', 'abnormal', 'attention'].includes(refund.status)) return refund
    await this.assertMerchant(refund.payment)
    try {
      let result
      try { result = await this.wx.queryRefund(id) }
      catch (e) {
        const absent = e instanceof WechatApiError && e.code === 'RESOURCE_NOT_EXISTS'
        const uncertain = (e instanceof ServiceUnavailableException || (e instanceof WechatApiError && e.httpStatus >= 500)) && refund.attempts > 0 && Date.now() - refund.createdAt.getTime() >= 60000
        if (!absent && !uncertain) throw e
        // Reuse exactly the same refund number after an ambiguous request or crash.
        result = await this.wx.refund(id, refund.paymentId, refund.payment.amountFen, refund.amountFen, refund.reason)
      }
      if (result.out_refund_no !== id || result.out_trade_no !== refund.paymentId || result.amount?.total !== refund.payment.amountFen || result.amount.refund !== refund.amountFen || result.amount.currency !== 'CNY') throw new BadRequestException('退款结果不匹配')
      await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "CommerceBill" WHERE id = ${refund.payment.billId} FOR UPDATE`
        const current = await tx.commerceRefund.findUniqueOrThrow({ where: { id } })
        if (current.status === 'success') return
        const status = result.status === 'SUCCESS' ? 'success' : result.status === 'CLOSED' ? 'closed' : refund.attempts >= 119 ? 'attention' : result.status === 'ABNORMAL' ? 'abnormal' : 'processing'
        await tx.commerceRefund.update({ where: { id }, data: { status, lastError: status === 'abnormal' ? '渠道退款异常，请在微信商户平台处理后复核' : null, nextCheckAt: new Date(Date.now() + 60000), attempts: { increment: 1 }, ...(status === 'success' ? { completedAt: new Date() } : {}) } })
        if (status === 'success') {
          const bill = await tx.commerceBill.findUniqueOrThrow({ where: { id: refund.payment.billId } })
          const refundedFen = bill.refundedFen + refund.amountFen
          if (refundedFen > bill.paidFen) throw new ConflictException('累计退款超过收款')
          await tx.commerceBill.update({ where: { id: bill.id }, data: { refundedFen, ...(refundedFen === bill.paidFen ? { status: 'refunded' } : {}) } })
          await tx.auditLog.create({ data: { id: await this.ids.next('AL', tx), module: '交易经营', action: '确认微信退款', target: id, detail: `${refund.amountFen} 分`, operator: '系统', at: formatNow() } })
        }
      })
    } catch (e) {
      await this.db.commerceRefund.updateMany({ where: { id, status: { in: ['processing', 'abnormal', 'attention'] } }, data: { ...(refund.attempts >= 119 ? { status: 'attention' } : {}), lastError: '退款结果待确认，请核实渠道状态', nextCheckAt: new Date(Date.now() + Math.min(3600000, 60000 * (refund.attempts + 1))), attempts: { increment: 1 } } })
      throw e
    }
    return this.db.commerceRefund.findUniqueOrThrow({ where: { id } })
  }

  // Intentionally independent of the business scheduler's license write gate.
  @Cron(CronExpression.EVERY_MINUTE, { name: 'commerce-payment-recovery' })
  async recover() {
    if (!(await this.wx.config()).ready) return
    const payments = await this.db.commercePayment.findMany({ where: { status: 'pending', nextCheckAt: { lte: new Date() } }, take: 30, orderBy: { nextCheckAt: 'asc' } })
    for (const p of payments) { try { await this.syncPayment(p.id) } catch { this.logger.warn(`支付核实待处理 ${p.id}`) } }
    const refunds = await this.db.commerceRefund.findMany({ where: { status: { in: ['processing', 'abnormal'] }, nextCheckAt: { lte: new Date() } }, take: 30, orderBy: { nextCheckAt: 'asc' } })
    for (const r of refunds) { try { await this.syncRefund(r.id) } catch { this.logger.warn(`退款核实待处理 ${r.id}`) } }
  }
}
