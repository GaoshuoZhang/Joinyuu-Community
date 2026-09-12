import type { ReservationCreatePayload, Space, SpaceReservation, SpaceSlot } from '@/types'
import { appConfig, occupiedSlots, pushNotice, reservationsByUid, spaces } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 空间预约 handlers：开关校验 + 冲突预检（409 文案同 wiki §8.8）+ 通知触发点。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

export async function fetchSpaces(): Promise<Space[]> {
  return withLatency(() => [...spaces])
}

export async function fetchAvailability(spaceId: string, date: string): Promise<SpaceSlot[]> {
  return withLatency(() => {
    const space = spaces.find((s) => s.id === spaceId)
    if (!space) fail(404, '空间不存在')
    const occupied = new Set(occupiedSlots(spaceId, date).map((s) => s.start))
    const slots: SpaceSlot[] = []
    const open = Number(space.openTime.slice(0, 2))
    const close = Number(space.closeTime.slice(0, 2))
    for (let h = open; h < close; h++) {
      const start = `${String(h).padStart(2, '0')}:00`
      const end = `${String(h + 1).padStart(2, '0')}:00`
      slots.push({ start, end, occupied: occupied.has(start) })
    }
    return slots
  })
}

export async function createReservation(payload: ReservationCreatePayload): Promise<{ status: 'pending' | 'approved' }> {
  return withLatency(() => {
    const uid = requireUid()
    if (!appConfig.reservationOpen) fail(400, '空间预约暂未开放')
    const space = spaces.find((s) => s.id === payload.spaceId)
    if (!space) fail(404, '空间不存在')
    if (!payload.date) fail(400, '请选择预约日期')
    if (!payload.start || !payload.end) fail(400, '请选择预约时段')
    if (payload.start >= payload.end) fail(400, '结束时间需晚于开始时间')
    if (occupiedSlots(payload.spaceId, payload.date).some((s) => s.start < payload.end && payload.start < s.end)) {
      fail(409, '所选时段与已有预约冲突，请更换时段')
    }
    const mine = (reservationsByUid[uid] ??= [])
    if (mine.some((r) => r.spaceId === payload.spaceId && r.date === payload.date && r.status !== 'cancelled' && r.start < payload.end && payload.start < r.end)) {
      fail(409, '你已预约该时段，请勿重复提交')
    }
    const status: 'pending' | 'approved' = space.needApproval ? 'pending' : 'approved'
    mine.unshift({
      id: `SR${Date.now()}`, spaceId: space.id, spaceName: space.name,
      date: payload.date, start: payload.start, end: payload.end,
      status, createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16),
    })
    /* [MOCK-ONLY] 通知触发点：预约已提交 */
    pushNotice(uid, {
      type: 'system',
      title: status === 'approved' ? '预约成功' : '预约已提交，待审核',
      content: `「${space.name}」${payload.date} ${payload.start}-${payload.end}${status === 'approved' ? '预约成功。' : '预约已提交，审核通过后将通知你。'}`,
      link: '/me/reservations',
    })
    return { status }
  })
}

export async function fetchMyReservations(): Promise<SpaceReservation[]> {
  return withLatency(() => {
    const uid = requireUid()
    return [...(reservationsByUid[uid] ?? [])]
  })
}

export async function cancelReservation(id: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const item = (reservationsByUid[uid] ?? []).find((r) => r.id === id)
    if (!item) fail(404, '预约不存在')
    if (item.status !== 'pending' && item.status !== 'approved') fail(409, '当前状态不可取消')
    item.status = 'cancelled'
    /* [MOCK-ONLY] 通知触发点：预约已取消 */
    pushNotice(uid, { type: 'system', title: '预约已取消', content: `「${item.spaceName}」${item.date} ${item.start}-${item.end} 的预约已取消。`, link: '/me/reservations' })
  }, 150)
}
