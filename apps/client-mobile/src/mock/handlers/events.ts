import type { CheckinPayload, CommunityEvent, MyEnrollmentItem } from '@/types'
import { accountByUid, enrollmentsByUid, events, grantPoints, nextEnrollmentId, pushNotice } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 活动中心 handlers。可见范围/可报名范围（缺口 §7-9）按身份模拟；
 * 签到（缺口 §7.1-2）完整模拟：时间窗 + Haversine 围栏 + 防重复 + activity_checkin 积分。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

function myIdentitiesOf(): { type: string; level?: number }[] {
  const uid = readPayload()?.sub
  const account = uid ? accountByUid(uid) : undefined
  return account?.identities ?? [{ type: 'individual' }]
}

function visibleTo(ev: CommunityEvent): boolean {
  const ids = myIdentitiesOf()
  if (ev.visibilityIdentities.length === 0) return true
  return ids.some((i) => {
    if (!ev.visibilityIdentities.includes(i.type as never)) return false
    if (ev.visibilityLevels.length === 0) return true
    return i.level !== undefined && ev.visibilityLevels.includes(i.level)
  })
}

function canEnroll(ev: CommunityEvent): boolean {
  const ids = myIdentitiesOf()
  if (ev.enrollmentIdentities.length === 0) return true
  return ids.some((i) => {
    if (!ev.enrollmentIdentities.includes(i.type as never)) return false
    if (ev.enrollmentLevels.length === 0) return true
    return i.level !== undefined && ev.enrollmentLevels.includes(i.level)
  })
}

function enrich(ev: CommunityEvent): CommunityEvent {
  const uid = readPayload()?.sub
  const mine = uid ? (enrollmentsByUid[uid] ?? []).find((e) => e.eventId === ev.id && e.status !== 'cancelled') : undefined
  return { ...ev, myEnrollmentStatus: mine?.status, myCheckedIn: mine?.checkedIn ?? false }
}

export async function fetchEvents(query: { type?: string; keyword?: string } = {}): Promise<CommunityEvent[]> {
  return withLatency(() => {
    let list = events.filter((e) => e.status === 'published' && visibleTo(e))
    if (query.type) list = list.filter((e) => e.typeLabel === query.type)
    if (query.keyword) list = list.filter((e) => e.title.includes(query.keyword!))
    return list.map(enrich)
  })
}

export async function fetchEvent(id: string): Promise<CommunityEvent> {
  return withLatency(() => {
    const ev = events.find((e) => e.id === id)
    if (!ev || (ev.status === 'ended' ? false : !visibleTo(ev))) fail(404, '活动不存在或已结束')
    return enrich(ev)
  }, 200)
}

export async function enrollEvent(id: string): Promise<{ status: 'approved' | 'pending' }> {
  return withLatency(() => {
    const uid = requireUid()
    const ev = events.find((e) => e.id === id)
    if (!ev || ev.status !== 'published') fail(404, '活动不存在或已结束')
    if (!canEnroll(ev)) fail(403, '当前身份不在该活动的可报名范围内')
    if (new Date(ev.enrollmentDeadline.replace('-', '/')).getTime() < Date.now()) fail(409, '报名已截止')
    const mine = (enrollmentsByUid[uid] ??= [])
    if (mine.some((e) => e.eventId === id && e.status !== 'cancelled')) fail(409, '你已报名该活动')
    if (ev.approvedCount >= ev.capacity) fail(409, '活动名额已满')
    const status: 'approved' | 'pending' = ev.requireReview ? 'pending' : 'approved'
    mine.unshift({ id: nextEnrollmentId(), eventId: id, eventTitle: ev.title, startTime: ev.startTime, location: ev.location, status, checkedIn: false })
    if (status === 'approved') ev.approvedCount += 1
    /* [MOCK-ONLY] 通知触发点：报名结果（requireReview 时为待审核提示） */
    pushNotice(uid, {
      type: 'enroll_result',
      title: status === 'approved' ? '报名成功' : '报名已提交，待审核',
      content: `「${ev.title}」${status === 'approved' ? '报名成功，记得准时参加。' : '报名已提交，审核通过后将通知你。'}`,
      link: '/me/enrollments',
    })
    return { status }
  })
}

export async function cancelEnrollment(id: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const mine = (enrollmentsByUid[uid] ??= [])
    const item = mine.find((e) => e.eventId === id && (e.status === 'pending' || e.status === 'approved'))
    if (!item) fail(404, '未找到可取消的报名记录')
    const ev = events.find((e) => e.id === id)
    if (ev && item.status === 'approved' && ev.approvedCount > 0) ev.approvedCount -= 1
    item.status = 'cancelled'
  })
}

export async function fetchMyEnrollments(): Promise<MyEnrollmentItem[]> {
  return withLatency(() => {
    const uid = requireUid()
    return [...(enrollmentsByUid[uid] ?? [])]
  })
}

/* ---------- 签到（[MOCK-ONLY]，缺口 §7.1-2） ---------- */

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export async function checkInEvent(id: string, payload: CheckinPayload): Promise<{ pointsAwarded: number }> {
  return withLatency(() => {
    const uid = requireUid()
    const ev = events.find((e) => e.id === id)
    if (!ev) fail(404, '活动不存在')
    const mine = (enrollmentsByUid[uid] ??= []).find((e) => e.eventId === id && e.status !== 'cancelled')
    if (!mine || mine.status !== 'approved') fail(400, '请先报名并通过审核后再签到')
    if (mine.checkedIn) fail(409, '该活动已签到过，请勿重复签到')
    if (ev.status === 'ended') fail(400, '活动已结束，无法签到')

    const now = new Date()
    const start = new Date(`${ev.startTime.replace('-', '/')}`)
    const end = new Date(`${ev.endTime.replace('-', '/')}`)
    const openAt = new Date(start)
    openAt.setHours(Math.floor(minutesOf(ev.checkinOpenMin) / 60), minutesOf(ev.checkinOpenMin) % 60, 0, 0)
    const closeAt = new Date(end)
    closeAt.setHours(Math.floor(minutesOf(ev.checkinCloseMin) / 60), minutesOf(ev.checkinCloseMin) % 60, 0, 0)
    if (now < openAt) fail(400, `未到签到时间，签到将于 ${ev.checkinOpenMin} 开放`)
    if (now > closeAt) fail(400, '活动已结束，无法签到')

    const distance = haversineM(payload.lat, payload.lng, ev.venueLat, ev.venueLng)
    if (distance > ev.checkinRadiusM) {
      fail(400, `签到失败：距场地约 ${distance} 米，超出签到范围（${ev.checkinRadiusM} 米）`)
    }

    mine.checkedIn = true
    /* [MOCK-ONLY] 积分触发点：activity_checkin（签到积分，M1.5 已建引擎规则） */
    const pointsAwarded = 10
    grantPoints(uid, pointsAwarded, `活动签到：${ev.title}`, '活动签到')
    pushNotice(uid, { type: 'points', title: '签到成功', content: `「${ev.title}」签到成功，积分 +${pointsAwarded}。`, link: '/me/points' })
    return { pointsAwarded }
  })
}
