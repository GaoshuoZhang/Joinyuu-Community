import { parseLocalDateTime } from './format'

/** 两个报名入口使用同一边界：待审/候补可退出，已通过按配置时限。 */
export function canCancelEnrollment(item: {
  status?: string
  checkedIn?: boolean
  eventStatus?: string
  startTime: string
  endTime?: string
  rescheduledTo?: string
  cancelDeadlineHours?: number
}, now: number): boolean {
  if (item.checkedIn || item.eventStatus === 'cancelled' || item.eventStatus === 'ended') return false
  /* 待付款/现金报名需走现金交易取消或退款，不能调用原免费报名取消接口 */
  if (item.status === 'pending_payment') return false
  const end = parseLocalDateTime(item.endTime ?? '')
  if (end && now >= end.getTime()) return false
  if (item.status === 'pending' || item.status === 'waitlisted') return true
  if (item.status !== 'approved') return false
  const start = parseLocalDateTime(item.rescheduledTo || item.startTime)
  return start !== null && now < start.getTime() - (item.cancelDeadlineHours ?? 24) * 3600_000
}
