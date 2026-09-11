/* 空间预约展示状态派生：待审核/待使用/使用中/已结束/已驳回/已取消
 * （存储状态仅 pending/approved/rejected/cancelled，待使用/使用中/已结束由时间派生） */
export type ReservationViewStatus = 'pending' | 'approved' | 'using' | 'ended' | 'rejected' | 'cancelled'

export interface ReservationTimeLike {
  status: string
  date: string
  startTime: string
  endTime: string
}

function nowStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function deriveReservationStatus(r: ReservationTimeLike): ReservationViewStatus {
  if (r.status === 'pending') return 'pending'
  if (r.status === 'rejected') return 'rejected'
  if (r.status === 'cancelled') return 'cancelled'
  const now = nowStr()
  const start = `${r.date} ${r.startTime}`
  const end = `${r.date} ${r.endTime}`
  if (now < start) return 'approved'
  if (now <= end) return 'using'
  return 'ended'
}
