import { BadRequestException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { IdGeneratorService } from '../id-generator/id-generator.service'
import { formatNow } from '../utils/time'

/* 空间预约费用（积分）口径：结算与展示共用同一算法。
 * 计费小时：不足 1 小时按 1 小时计——全天开放空间的结束时间为 23:59，
 * 因此「N 小时 59 分」按 N+1 小时计费。
 * 客户端展示（apps/client-mobile/src/utils/spaceRange.ts）需与此保持一致。 */

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

/** 计费小时数（向上取整到整小时；非法/空时段返回 0） */
export function billableHours(start: string, end: string): number {
  if (!start || !end) return 0
  const minutes = toMinutes(end) - toMinutes(start)
  return minutes > 0 ? Math.ceil(minutes / 60) : 0
}

/** 预约费用（积分）= 计费小时 × 空间每小时积分；feePerHour 为 0 表示免费 */
export function reservationFeePoints(feePerHour: number, start: string, end: string): number {
  if (!feePerHour || feePerHour <= 0) return 0
  return billableHours(start, end) * feePerHour
}

/** 提交预约扣费：事务内条件扣减（余额不足整单回滚）+ 负向流水（source=space） */
export async function chargeSpaceFee(
  tx: Prisma.TransactionClient,
  ids: IdGeneratorService,
  params: { userId: string; points: number; reason: string },
): Promise<void> {
  const { userId, points, reason } = params
  if (points <= 0) return
  const deducted = await tx.user.updateMany({
    where: { uid: userId, points: { gte: points } },
    data: { points: { decrement: points } },
  })
  if (deducted.count !== 1) throw new BadRequestException('积分不足，无法预约该空间')
  const after = await tx.user.findUnique({ where: { uid: userId }, select: { points: true } })
  await tx.pointsRecord.create({
    data: {
      id: await ids.next('PT', tx),
      userId,
      delta: -points,
      balance: after?.points ?? 0,
      reason,
      at: formatNow(),
      operator: '系统',
      source: 'space',
    },
  })
}

/** 驳回/取消预约退费：退回该笔消耗的积分 + 正向流水（source=space） */
export async function refundSpaceFee(
  tx: Prisma.TransactionClient,
  ids: IdGeneratorService,
  params: { userId: string; points: number; reason: string },
): Promise<void> {
  const { userId, points, reason } = params
  if (points <= 0) return
  const refunded = await tx.user.update({
    where: { uid: userId },
    data: { points: { increment: points } },
    select: { points: true },
  })
  await tx.pointsRecord.create({
    data: {
      id: await ids.next('PT', tx),
      userId,
      delta: points,
      balance: refunded.points,
      reason,
      at: formatNow(),
      operator: '系统',
      source: 'space',
    },
  })
}