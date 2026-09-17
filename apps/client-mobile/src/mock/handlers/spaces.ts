import type { ReservationCreatePayload, Space, SpaceReservation, SpaceSlot } from '@/types'
import { accountByUid, appConfig, enterprises, nextMockId, nowStamp, occupiedSlots, pushNotice, reservationsByUid, spaces, trackMockEvent } from '@/mock/db'
import { permissionsOf } from '@/mock/handlers/enterprises'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'
import { formatMockDate, mockNowMs } from '@/mock/runtime'

/* [MOCK-ONLY] 空间预约 handlers：开关校验 + 冲突预检（409 文案同 wiki §8.8）+ 通知触发点。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

export async function fetchSpaces(): Promise<Space[]> {
  return withLatency(() => [...spaces])
}

export async function fetchSpaceDetail(id: string): Promise<Space> {
  return withLatency(() => {
    const space = spaces.find((s) => s.id === id)
    if (!space) fail(404, '空间不存在或已下架')
    return { ...space }
  }, 120)
}

export async function fetchAvailability(spaceId: string, date: string): Promise<SpaceSlot[]> {
  return withLatency(() => {
    const space = spaces.find((s) => s.id === spaceId)
    if (!space) fail(404, '空间不存在')
    const occupied = occupiedSlots(spaceId, date)
    const slots: SpaceSlot[] = []
    const open = Number(space.openTime.slice(0, 2))
    const close = Number(space.closeTime.slice(0, 2))
    for (let h = open; h < close; h++) {
      const start = `${String(h).padStart(2, '0')}:00`
      const end = `${String(h + 1).padStart(2, '0')}:00`
      slots.push({ start, end, occupied: occupied.some((slot) => slot.start < end && start < slot.end) })
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
    /* v38：空间规则校验（维护 / 提前天数 / 最长时长 / 开放时间） */
    if (space.status === 'maintenance') fail(400, '该空间维护中，暂不可预约')
    if (!payload.date) fail(400, '请选择预约日期')
    if (payload.date < formatMockDate()) fail(400, '预约日期不能早于今天')
    const maxDate = new Date(mockNowMs())
    maxDate.setDate(maxDate.getDate() + space.advanceDays)
    if (payload.date > formatMockDate(maxDate.getTime())) fail(400, `最多可提前 ${space.advanceDays} 天预约`)
    if (!payload.start || !payload.end) fail(400, '请选择预约时段')
    if (payload.start >= payload.end) fail(400, '结束时间需晚于开始时间')
    const minutes = (time: string) => {
      const [h, m] = time.split(':').map(Number)
      return h * 60 + (m || 0)
    }
    const durationHours = (minutes(payload.end) - minutes(payload.start)) / 60
    if (durationHours > space.maxHours) fail(400, `单次预约最长 ${space.maxHours} 小时`)
    if (payload.start < space.openTime || payload.end > space.closeTime) {
      fail(400, `预约时间需在开放时段 ${space.openTime}-${space.closeTime} 内`)
    }
    if (occupiedSlots(payload.spaceId, payload.date).some((s) => s.start < payload.end && payload.start < s.end)) {
      fail(409, '所选时段与已有预约冲突，请更换时段')
    }
    const mine = (reservationsByUid[uid] ??= [])
    if (mine.some((r) => r.spaceId === payload.spaceId && r.date === payload.date && (r.status === 'pending' || r.status === 'approved') && r.start < payload.end && payload.start < r.end)) {
      fail(409, '你已预约该时段，请勿重复提交')
    }
    const status: 'pending' | 'approved' = space.needApproval ? 'pending' : 'approved'
    /* 主体快照：以哪个身份预约（个人身份存昵称，企业身份存企业名/组织名） */
    const account = accountByUid(uid)
    const identity = account?.identities.find((i) => i.type === payload.asIdentity) ?? account?.identities[0]
    let identityType = identity?.type ?? 'individual'
    let subjectName =
      identityType === 'community_enterprise'
        ? (identity?.enterpriseName ?? account?.nickname ?? '')
        : identityType === 'external_enterprise'
          ? (identity?.organizationName ?? account?.nickname ?? '')
          : (account?.nickname ?? '')
    /* 成员代企业预约：校验企业成员权限（space_reserve），主体快照为企业名 */
    if (payload.asIdentity === 'community_enterprise' && payload.asEnterpriseId) {
      const ent = enterprises.find((x) => x.id === payload.asEnterpriseId)
      if (!ent) fail(404, '企业不存在')
      if (!permissionsOf(ent, uid).includes('space_reserve')) fail(403, '你没有代企业预约空间的权限')
      identityType = 'community_enterprise'
      subjectName = ent.name
    }
    mine.unshift({
      id: nextMockId('SR'), spaceId: space.id, spaceName: space.name,
      date: payload.date, start: payload.start, end: payload.end,
      status, createdAt: nowStamp(),
      identityType, subjectName,
    })
    /* [MOCK-ONLY] 通知触发点：预约已提交 */
    pushNotice(uid, {
      type: 'system',
      title: status === 'approved' ? '预约成功' : '预约已提交，待审核',
      content: `「${space.name}」${payload.date} ${payload.start}-${payload.end} ${status === 'approved' ? '预约成功。' : '预约已提交，审核通过后将通知你。'}`,
      link: '/me/reservations',
    })
    trackMockEvent('reservation_create')
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
