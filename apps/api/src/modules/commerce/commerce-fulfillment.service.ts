import { Injectable, Logger } from '@nestjs/common'
import type { CommerceOrder, Prisma } from '@prisma/client'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { PrismaService } from '../../common/prisma/prisma.service'
import { NotificationService } from '../../common/notify/notification.service'
import { PointsEngineService } from '../../common/engine/points-engine/points-engine.service'
import { formatNow } from '../../common/utils/time'

const ENROLL_APPROVED_REASON = '活动报名奖励'
const DEFAULT_VOUCHER_VALID_DAYS = 30

type OrderRow = CommerceOrder

/** 现金业务履约：付款确认、退款结果与业务权益在同一数据库事务内联动。
 * 只有客户端订单（CommerceOrder）会触发；后台手工应收账单保持原样，不自动发券/报名/占资源。 */
@Injectable()
export class CommerceFulfillmentService {
  private readonly logger = new Logger(CommerceFulfillmentService.name)
  constructor(
    private readonly db: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly engine: PointsEngineService,
    private readonly notify: NotificationService,
  ) {}

  /* ---------------- 付款成功 ---------------- */

  /** 在支付确认事务内调用：登记资金事实并按来源发放权益；履约失败不吞掉收款，转为待处理。 */
  async onPaid(tx: Prisma.TransactionClient, billId: string): Promise<void> {
    const order = await tx.commerceOrder.findUnique({ where: { billId } })
    if (!order || order.paymentStatus === 'paid') return
    const now = new Date()
    await tx.commerceOrder.update({
      where: { id: order.id },
      data: { paymentStatus: 'paid', paidFen: order.amountFen, paidAt: now, closedAt: null },
    })
    if (order.fulfillmentStatus === 'cancelled') {
      // 资源已按未付款回收后渠道才确认收款：保留收款事实并转人工，禁止回滚成未付款。
      await this.markException(tx, order.id, '付款晚于资源回收，需人工核对并退款或补发权益')
      return
    }
    try {
      switch (order.sourceType) {
        case 'mall': await this.fulfillMall(tx, order); break
        case 'space': await this.fulfillSpace(tx, order); break
        case 'event': await this.fulfillEvent(tx, order); break
        case 'lease_bill': await this.fulfillLeaseBill(tx, order); break
        default: await this.markException(tx, order.id, '未知业务类型，需人工处理')
      }
    } catch (e) {
      this.logger.error(`订单履约失败 ${order.id}: ${e instanceof Error ? e.message : String(e)}`)
      await this.markException(tx, order.id, '已收到付款，权益准备失败，请联系运营处理')
    }
  }

  private async fulfillMall(tx: Prisma.TransactionClient, order: OrderRow) {
    const goods = await tx.mallGoods.findUnique({ where: { id: order.sourceId } })
    if (!goods) return this.markException(tx, order.id, '商品已不存在，需人工处理')
    const now = formatNow()
    const validDays = goods.validDays ?? DEFAULT_VOUCHER_VALID_DAYS
    const redemptionId = await this.ids.next('RO', tx)
    const voucherCode = await this.uniqueVoucherCode(tx)
    await tx.redemptionOrder.create({
      data: {
        id: redemptionId,
        userId: order.createdBy,
        userName: order.buyerName,
        goodsId: goods.id,
        goodsName: goods.name,
        points: 0,
        amountFen: order.amountFen,
        commerceOrderId: order.id,
        status: 'pending_use',
        createdAt: now,
        voucherCode,
        voucherExpiresAt: validDays === 0 ? '' : addDaysTime(now, validDays),
      },
    })
    await tx.mallGoods.update({ where: { id: goods.id }, data: { redeemedCount: { increment: 1 } } })
    await tx.commerceOrder.update({
      where: { id: order.id },
      data: { fulfillmentStatus: 'ready', redemptionOrderId: redemptionId, fulfilledAt: new Date(), lastError: null },
    })
    await this.notice(tx, order.createdBy, {
      type: 'mall',
      title: '购买成功，券码已发放',
      content: `「${goods.name}」已支付成功，券码可在“我的订单”或“现金交易”中查看。`,
      link: `/me/orders/${redemptionId}`,
    })
  }

  private async fulfillSpace(tx: Prisma.TransactionClient, order: OrderRow) {
    if (!order.reservationId) return this.markException(tx, order.id, '预约记录缺失，需人工处理')
    const reservation = await tx.spaceReservation.findUnique({ where: { id: order.reservationId } })
    if (!reservation || reservation.commerceOrderId !== order.id) return this.markException(tx, order.id, '预约记录不匹配，需人工处理')
    const now = formatNow()
    await tx.spaceReservation.update({
      where: { id: reservation.id },
      data: {
        status: 'approved',
        amountFen: order.amountFen,
        records: appendRecord(reservation.records, { at: now, action: 'pay', step: '支付成功', text: `已支付 ¥${fenText(order.amountFen)}，预约生效` }),
      },
    })
    await tx.commerceOrder.update({ where: { id: order.id }, data: { fulfillmentStatus: 'ready', fulfilledAt: new Date(), lastError: null } })
    await this.notice(tx, order.createdBy, {
      type: 'system',
      title: '预约已确认',
      content: `「${reservation.spaceName}」${reservation.date} ${reservation.startTime}-${reservation.endTime} 已支付成功，预约生效。`,
      link: `/me/reservations/${reservation.id}`,
    })
  }

  private async fulfillEvent(tx: Prisma.TransactionClient, order: OrderRow) {
    if (!order.enrollmentId) return this.markException(tx, order.id, '报名记录缺失，需人工处理')
    const enrollment = await tx.eventEnrollment.findUnique({ where: { id: order.enrollmentId }, include: { event: true } })
    if (!enrollment || enrollment.commerceOrderId !== order.id) return this.markException(tx, order.id, '报名记录不匹配，需人工处理')
    if (enrollment.status !== 'pending_payment') return this.markException(tx, order.id, '报名状态已变化，需人工处理')
    await tx.eventEnrollment.update({
      where: { id: enrollment.id },
      data: { status: 'approved', waitlisted: false, waitlistOrder: null, afterSalesFrozen: false },
    })
    const event = enrollment.event
    if (event.enrollPoints != null) {
      await this.engine.issueFixedPointsInTransaction(tx, enrollment.userId, event.enrollPoints, ENROLL_APPROVED_REASON, `enroll:${enrollment.userId}:${event.id}`)
    } else {
      await this.engine.issuePointsInTransaction(tx, enrollment.userId, 'activity_enroll_approved', ENROLL_APPROVED_REASON, `enroll:${enrollment.userId}:${event.id}`)
    }
    await tx.commerceOrder.update({ where: { id: order.id }, data: { fulfillmentStatus: 'ready', fulfilledAt: new Date(), lastError: null } })
    await this.notice(tx, enrollment.userId, {
      type: 'event',
      title: '报名成功，电子票已准备',
      content: `「${event.title}」报名费用已支付，报名已确认，可在“我的报名”查看电子票。`,
      link: `/me/enrollments`,
    })
  }

  private async fulfillLeaseBill(tx: Prisma.TransactionClient, order: OrderRow) {
    /* 账单缴费本身即完成：标记 used，使“已完成”筛选与展示一致；不生成新的业务权益。 */
    await tx.commerceOrder.update({ where: { id: order.id }, data: { fulfillmentStatus: 'used', fulfilledAt: new Date(), lastError: null } })
    await this.notice(tx, order.createdBy, {
      type: 'system',
      title: '账单已支付',
      content: `「${order.sourceName}」账单已支付成功，可在“现金交易”查看记录。`,
      link: `/me/transactions/${order.id}`,
    })
  }

  /* ---------------- 退款申请 ---------------- */

  /** 提交退款申请时冻结可退款权益，避免审核期间继续核销/签到。 */
  async onRefundRequested(tx: Prisma.TransactionClient, billId: string): Promise<void> {
    const order = await tx.commerceOrder.findUnique({ where: { billId } })
    if (!order || order.paymentStatus !== 'paid') return
    await tx.commerceOrder.update({ where: { id: order.id }, data: { afterSalesStatus: 'requested' } })
    if (order.sourceType === 'mall' && order.redemptionOrderId) {
      await tx.redemptionOrder.updateMany({ where: { id: order.redemptionOrderId, status: 'pending_use' }, data: { afterSalesFrozen: true } })
    } else if (order.sourceType === 'space' && order.reservationId) {
      await tx.spaceReservation.updateMany({ where: { id: order.reservationId }, data: { afterSalesFrozen: true } })
    } else if (order.sourceType === 'event' && order.enrollmentId) {
      await tx.eventEnrollment.updateMany({ where: { id: order.enrollmentId }, data: { afterSalesFrozen: true } })
    }
    await this.notice(tx, order.createdBy, {
      type: 'system',
      title: '退款申请已提交',
      content: `「${order.sourceName}」的退款申请已提交，等待运营审核；审核结果将通过站内信通知。`,
      link: `/me/transactions/${order.id}`,
    })
  }

  async onRefundRejected(tx: Prisma.TransactionClient, billId: string): Promise<void> {
    const order = await tx.commerceOrder.findUnique({ where: { billId } })
    if (!order) return
    await tx.commerceOrder.update({ where: { id: order.id }, data: { afterSalesStatus: 'rejected' } })
    await this.setFrozen(tx, order, false)
    await this.notice(tx, order.createdBy, {
      type: 'system',
      title: '退款申请未通过',
      content: `「${order.sourceName}」的退款申请未通过，权益已恢复正常使用。如有疑问请联系运营。`,
      link: `/me/transactions/${order.id}`,
    })
  }

  /* ---------------- 退款渠道结果 ---------------- */

  /** 渠道退款结果回写：成功时取消权益并按来源回补资源；异常保留冻结等待人工。 */
  async onRefundResult(tx: Prisma.TransactionClient, billId: string, status: string, amountFen: number): Promise<void> {
    const order = await tx.commerceOrder.findUnique({ where: { billId } })
    if (!order) return
    if (status === 'success') {
      await tx.commerceOrder.update({
        where: { id: order.id },
        data: {
          afterSalesStatus: 'refunded',
          fulfillmentStatus: 'cancelled',
          refundedFen: { increment: amountFen },
          lastError: null,
        },
      })
      await this.revoke(tx, order)
      await this.notice(tx, order.createdBy, {
        type: 'system',
        title: '退款成功',
        content: `「${order.sourceName}」已退款 ¥${fenText(amountFen)}，请留意微信支付到账通知。`,
        link: `/me/transactions/${order.id}`,
      })
      return
    }
    if (status === 'processing') {
      await tx.commerceOrder.update({ where: { id: order.id }, data: { afterSalesStatus: 'processing' } })
      return
    }
    // closed / abnormal / attention：保持权益冻结，转人工核对
    await tx.commerceOrder.update({ where: { id: order.id }, data: { afterSalesStatus: 'exception', lastError: '退款结果需人工核对' } })
  }

  private async revoke(tx: Prisma.TransactionClient, order: OrderRow) {
    if (order.sourceType === 'mall' && order.redemptionOrderId) {
      const claimed = await tx.redemptionOrder.updateMany({
        where: { id: order.redemptionOrderId, status: { not: 'cancelled' }, afterSalesFrozen: true },
        data: { status: 'cancelled', cancelledAt: formatNow(), cancelReason: '退款成功，券码作废', afterSalesFrozen: false },
      })
      if (claimed.count) await this.restoreStock(tx, order.sourceId, true)
    } else if (order.sourceType === 'space' && order.reservationId) {
      const reservation = await tx.spaceReservation.findUnique({ where: { id: order.reservationId } })
      if (reservation && reservation.status !== 'cancelled') {
        await tx.spaceReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'cancelled',
            afterSalesFrozen: false,
            records: appendRecord(reservation.records, { at: formatNow(), action: 'refund', step: '退款成功', text: '现金退款成功，预约已取消' }),
          },
        })
      }
    } else if (order.sourceType === 'event' && order.enrollmentId) {
      const enrollment = await tx.eventEnrollment.findUnique({ where: { id: order.enrollmentId }, include: { event: true } })
      if (enrollment && enrollment.status !== 'cancelled') {
        await tx.eventEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'cancelled', waitlisted: false, waitlistOrder: null, afterSalesFrozen: false },
        })
        await this.promoteWaitlist(tx, enrollment.event)
      }
    }
  }

  /* ---------------- 未付款关闭 ---------------- */

  /** 释放未付款订单占用的库存/时段/名额；已付款订单禁止调用。返回是否由本次调用完成释放。 */
  async releaseUnpaid(tx: Prisma.TransactionClient, orderId: string, reason: string): Promise<boolean> {
    const changed = await tx.commerceOrder.updateMany({
      where: { id: orderId, paymentStatus: { in: ['unpaid', 'closed'] }, fulfillmentStatus: { in: ['pending', 'exception'] } },
      data: { paymentStatus: 'closed', fulfillmentStatus: 'cancelled', closedAt: new Date(), lastError: reason.slice(0, 255) },
    })
    if (!changed.count) return false
    const order = await tx.commerceOrder.findUnique({ where: { id: orderId } })
    if (!order) return false
    if (order.sourceType === 'mall') {
      await this.restoreStock(tx, order.sourceId, false)
    } else if (order.sourceType === 'space' && order.reservationId) {
      const reservation = await tx.spaceReservation.findUnique({ where: { id: order.reservationId } })
      if (reservation && reservation.status === 'pending_payment') {
        await tx.spaceReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'cancelled',
            records: appendRecord(reservation.records, { at: formatNow(), action: 'close', step: '支付超时', text: reason }),
          },
        })
      }
    } else if (order.sourceType === 'event' && order.enrollmentId) {
      const enrollment = await tx.eventEnrollment.findUnique({ where: { id: order.enrollmentId }, include: { event: true } })
      if (enrollment && enrollment.status === 'pending_payment') {
        await tx.eventEnrollment.update({ where: { id: enrollment.id }, data: { status: 'cancelled', waitlisted: false, waitlistOrder: null } })
        await this.promoteWaitlist(tx, enrollment.event)
      }
    }
    // 租约账单来自后台出账，取消客户端缴费不能作废账单，仍需保留待缴状态。
    if (order.sourceType !== 'lease_bill') {
      await tx.commerceBill.updateMany({ where: { id: order.billId ?? '', status: 'unpaid', paidFen: 0 }, data: { status: 'void' } })
    }
    await this.notice(tx, order.createdBy, {
      type: 'system',
      title: '订单已关闭',
      content: `「${order.sourceName}」未在有效期内完成支付，订单已关闭，请重新选择。`,
      link: `/me/transactions/${order.id}`,
    })
    return true
  }

  /** 后台已退款/关单等场景下同步订单售后状态（后台操作不冻结客户端权益的例外路径）。 */
  async markAfterSales(tx: Prisma.TransactionClient, billId: string, status: 'requested' | 'rejected' | 'processing' | 'refunded' | 'exception') {
    const order = await tx.commerceOrder.findUnique({ where: { billId } })
    if (!order) return
    await tx.commerceOrder.update({ where: { id: order.id }, data: { afterSalesStatus: status } })
    if (status === 'rejected') await this.setFrozen(tx, order, false)
  }

  private async setFrozen(tx: Prisma.TransactionClient, order: OrderRow, frozen: boolean) {
    if (order.sourceType === 'mall' && order.redemptionOrderId) {
      await tx.redemptionOrder.updateMany({ where: { id: order.redemptionOrderId }, data: { afterSalesFrozen: frozen } })
    } else if (order.sourceType === 'space' && order.reservationId) {
      await tx.spaceReservation.updateMany({ where: { id: order.reservationId }, data: { afterSalesFrozen: frozen } })
    } else if (order.sourceType === 'event' && order.enrollmentId) {
      await tx.eventEnrollment.updateMany({ where: { id: order.enrollmentId }, data: { afterSalesFrozen: frozen } })
    }
  }

  private async restoreStock(tx: Prisma.TransactionClient, goodsId: string, sold: boolean) {
    const goods = await tx.mallGoods.findUnique({ where: { id: goodsId }, select: { status: true, stock: true } })
    if (!goods) return
    await tx.mallGoods.update({
      where: { id: goodsId },
      data: {
        stock: { increment: 1 },
        ...(sold ? { redeemedCount: { decrement: 1 } } : {}),
        ...(goods.status === 'restock' && goods.stock + 1 > 0 ? { status: 'on' } : {}),
      },
    })
  }

  private async promoteWaitlist(tx: Prisma.TransactionClient, event: { id: string; title: string; enrollPoints: number | null; chargeAmountFen: number }) {
    /* 收费活动候补不开放自动递补：候补人员未付款，自动通过会变成免费报名。 */
    if (event.chargeAmountFen > 0) return
    const candidate = await tx.eventEnrollment.findFirst({
      where: { eventId: event.id, status: 'waitlisted', waitlisted: true },
      orderBy: { waitlistOrder: 'asc' },
    })
    if (!candidate) return
    await tx.eventEnrollment.update({
      where: { id: candidate.id },
      data: { status: 'approved', waitlisted: false, waitlistOrder: null },
    })
    if (event.enrollPoints != null) {
      await this.engine.issueFixedPointsInTransaction(tx, candidate.userId, event.enrollPoints, ENROLL_APPROVED_REASON, `enroll:${candidate.userId}:${event.id}`)
    } else {
      await this.engine.issuePointsInTransaction(tx, candidate.userId, 'activity_enroll_approved', ENROLL_APPROVED_REASON, `enroll:${candidate.userId}:${event.id}`)
    }
    await this.notice(tx, candidate.userId, {
      type: 'event',
      title: '报名递补成功',
      content: `您报名的活动「${event.title}」已有名额释放，已自动递补成功，请留意活动安排。`,
    })
  }

  private async markException(tx: Prisma.TransactionClient, orderId: string, message: string) {
    await tx.commerceOrder.update({ where: { id: orderId }, data: { fulfillmentStatus: 'exception', lastError: message.slice(0, 255) } })
  }

  private async notice(tx: Prisma.TransactionClient, userId: string, input: { type: string; title: string; content: string; link?: string }) {
    try { await this.notify.pushNoticeInTransaction(tx, userId, input) }
    catch (e) { this.logger.warn(`订单通知写入失败 ${userId}: ${e instanceof Error ? e.message : String(e)}`) }
  }

  private async uniqueVoucherCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const code = generateVoucherCode()
      const exists = await tx.redemptionOrder.findFirst({ where: { voucherCode: code }, select: { id: true } })
      if (!exists) return code
    }
    throw new Error('券码生成冲突')
  }
}

function appendRecord(records: Prisma.JsonValue, record: Record<string, unknown>): Prisma.InputJsonValue {
  const list = Array.isArray(records) ? records : []
  return [...list, record] as Prisma.InputJsonValue
}

function generateVoucherCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = 'V'
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function addDaysTime(timeStr: string, days: number): string {
  const d = new Date(timeStr.replace(' ', 'T'))
  d.setDate(d.getDate() + days)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fenText(fen: number): string {
  return (fen / 100).toFixed(2)
}
