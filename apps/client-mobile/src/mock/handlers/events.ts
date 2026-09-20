import type { CheckinPayload, CommunityEvent, EventEnrollmentResult, EventFeedbackPayload, MyEnrollmentItem, MyEventFeedback } from '@/types'
import { accountByUid, enrollmentsByUid, eventFeedbackByUid, events, grantPoints, nextEnrollmentId, nowStamp, pushNotice, trackMockEvent } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'
import { mockNowDate, mockNowMs, parseMockStamp } from '@/mock/runtime'

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

/** 范围判定：按「单个身份」联合判定（类型命中且等级命中），多个身份取并集；两组都为空=不限 */
function scopeOk(identityTypes: string[], levels: number[], ids: { type: string; level?: number }[]): boolean {
  if (identityTypes.length === 0 && levels.length === 0) return true
  return ids.some(
    (i) =>
      (identityTypes.length === 0 || identityTypes.includes(i.type as never)) &&
      (levels.length === 0 || (i.level !== undefined && levels.includes(i.level))),
  )
}

function visibleTo(ev: CommunityEvent): boolean {
  return scopeOk(ev.visibilityIdentities, ev.visibilityLevels, myIdentitiesOf())
}

function canEnroll(ev: CommunityEvent): boolean {
  return scopeOk(ev.enrollmentIdentities, ev.enrollmentLevels, myIdentitiesOf())
}

function enrich(ev: (typeof events)[number]): CommunityEvent {
  const uid = readPayload()?.sub
  const mine = uid ? (enrollmentsByUid[uid] ?? []).find((e) => e.eventId === ev.id) : undefined
  const { approvedCount: _approvedCount, ...publicEvent } = ev
  void _approvedCount
  return { ...publicEvent, myEnrollmentStatus: mine?.status as CommunityEvent['myEnrollmentStatus'], myEnrollmentRejectReason: mine?.rejectReason, myCheckedIn: mine?.checkedIn ?? false }
}

export async function fetchEvents(query: { type?: string; keyword?: string } = {}): Promise<CommunityEvent[]> {
  return withLatency(() => {
    /* 仅返回已发布且未结束的活动（结束时间晚于当前） */
    let list = events.filter((e) => e.status === 'published' && parseMockStamp(e.endTime).getTime() > mockNowMs() && visibleTo(e))
    if (query.type) list = list.filter((e) => e.typeLabel === query.type)
    if (query.keyword) list = list.filter((e) => e.title.includes(query.keyword!))
    return list.map(enrich)
  })
}

export async function fetchEvent(id: string): Promise<CommunityEvent> {
  return withLatency(() => {
    const ev = events.find((e) => e.id === id)
    const uid = readPayload()?.sub
    const participant = !!uid && (enrollmentsByUid[uid] ?? []).some((enrollment) => enrollment.eventId === id)
    const publicVisible = !!ev && ev.status === 'published' && visibleTo(ev)
    if (!ev || (!participant && !publicVisible)) fail(404, '活动不存在或已结束')
    return enrich(ev)
  }, 200)
}
export async function enrollEvent(id: string): Promise<EventEnrollmentResult> {
  return withLatency(() => {
    const uid = requireUid()
    const ev = events.find((e) => e.id === id)
    if (!ev || ev.status !== 'published') fail(404, '活动不存在或已结束')
    if (ev.enrollmentOpen === false) fail(400, '报名暂未开放')
    if (!canEnroll(ev)) fail(403, '当前身份不在该活动的可报名范围内')
    if (parseMockStamp(ev.enrollmentDeadline).getTime() < mockNowMs()) fail(409, '报名已截止')
    const mine = (enrollmentsByUid[uid] ??= [])
    if (mine.some((e) => e.eventId === id && (e.status === 'pending' || e.status === 'approved' || e.status === 'waitlisted'))) fail(409, '你已报名该活动')
    /* v38：满员进入候补（按顺序自动递补）；有审核的活动满员同样候补 */
    if (ev.approvedCount >= ev.capacity) {
      const waitlistOrder = Object.values(enrollmentsByUid).flat().filter((e) => e.eventId === id && e.status === 'waitlisted').length + 1
      mine.unshift({ id: nextEnrollmentId(), eventId: id, eventTitle: ev.title, startTime: ev.startTime, location: ev.location, status: 'waitlisted', checkedIn: false, waitlistOrder })
      pushNotice(uid, { type: 'enroll_result', title: '已加入候补', content: `「${ev.title}」名额已满，你已加入候补（第 ${waitlistOrder} 位），有空位将自动递补并通知你。`, link: '/me/enrollments' })
      return { status: 'waitlisted', waitlistOrder }
    }
    const status: 'approved' | 'pending' = ev.requireReview ? 'pending' : 'approved'
    mine.unshift({ id: nextEnrollmentId(), eventId: id, eventTitle: ev.title, startTime: ev.startTime, location: ev.location, status, checkedIn: false })
    if (status === 'approved') {
      ev.approvedCount += 1
      grantPoints(uid, 5, `报名成功：${ev.title}`, '活动报名')
    }
    /* [MOCK-ONLY] 通知触发点：报名结果（requireReview 时为待审核提示） */
    pushNotice(uid, {
      type: 'enroll_result',
      title: status === 'approved' ? '报名成功' : '报名已提交，待审核',
      content: `「${ev.title}」${status === 'approved' ? '报名成功，记得准时参加。' : '报名已提交，审核通过后将通知你。'}`,
      link: '/me/enrollments',
    })
    trackMockEvent('event_enroll')
    return { status }
  })
}

/** 取消防止时间（v38）：活动开始前 24 小时内不可取消 */
const CANCEL_DEADLINE_MS = 24 * 60 * 60 * 1000

export async function cancelEnrollment(id: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const ev = events.find((e) => e.id === id)
    const mine = (enrollmentsByUid[uid] ??= [])
    const item = mine.find((e) => e.eventId === id && (e.status === 'pending' || e.status === 'approved' || e.status === 'waitlisted'))
    if (!item) fail(404, '未找到可取消的报名记录')
    if (item.checkedIn) fail(409, '已签到的活动不可取消报名')
    /* 取消时限仅约束已通过（approved）报名；待审核/候补可随时取消（对齐后端 cancel） */
    if (item.status === 'approved' && ev && parseMockStamp(ev.startTime).getTime() - mockNowMs() < CANCEL_DEADLINE_MS) {
      fail(409, '距活动开始不足 24 小时，无法取消；如无法到场请联系社区运营')
    }
    if (ev && item.status === 'approved' && ev.approvedCount > 0) ev.approvedCount -= 1
    item.status = 'cancelled'
    delete item.waitlistOrder
    /* v38：名额释放后自动递补候补第一位 */
    if (ev) {
      const waitlisted = Object.entries(enrollmentsByUid)
        .flatMap(([waitUid, list]) => list.filter((e) => e.eventId === id && e.status === 'waitlisted').map((e) => ({ waitUid, item: e })))
        .sort((a, b) => (a.item.waitlistOrder ?? 99) - (b.item.waitlistOrder ?? 99))
      const next = waitlisted[0]
      if (next && ev.approvedCount < ev.capacity) {
        next.item.status = 'approved'
        delete next.item.waitlistOrder
        ev.approvedCount += 1
        grantPoints(next.waitUid, 5, `候补递补成功：${ev.title}`, '活动报名')
        pushNotice(next.waitUid, { type: 'enroll_result', title: '候补递补成功', content: `「${ev.title}」有空位，你已自动递补为正式报名，记得准时参加。`, link: '/me/enrollments' })
      }
    }
  })
}

/** v42 活动电子票（报名成功后生成，可出示核验） */
export async function fetchEventTicket(eventId: string): Promise<import('@/types').EventTicket> {
  return withLatency(() => {
    const uid = requireUid()
    const item = (enrollmentsByUid[uid] ?? []).find((e) => e.eventId === eventId)
    if (!item) fail(404, '未找到该活动的报名记录')
    const ev = events.find((candidate) => candidate.id === eventId)
    const status = item.status === 'cancelled' || ev?.status === 'cancelled'
      ? 'cancelled'
      : item.ticketRedeemed
        ? 'checked'
        : ev?.status === 'ended' || (ev && parseMockStamp(ev.endTime).getTime() < mockNowMs())
          ? 'expired'
          : 'valid'
    return {
      eventId,
      eventTitle: item.eventTitle,
      startTime: ev?.startTime ?? item.startTime,
      location: ev?.location ?? item.location,
      ticketCode: `T${uid.replace(/\D/g, '').slice(-4) || '0000'}${eventId}`,
      status,
      checkedIn: item.checkedIn,
      waitlistOrder: item.waitlistOrder,
    }
  }, 140)
}

export async function fetchMyEnrollments(): Promise<MyEnrollmentItem[]> {
  return withLatency(() => {
    const uid = requireUid()
    /* v40：附带活动当前状态与改期时间，便于列表提示「已取消 / 已改期」 */
    return (enrollmentsByUid[uid] ?? []).map((item) => {
      const { ticketRedeemed: _ticketRedeemed, ...publicItem } = item
      void _ticketRedeemed
      const ev = events.find((candidate) => candidate.id === item.eventId)
      return {
        ...publicItem,
        startTime: ev?.startTime ?? item.startTime,
        eventStatus: ev?.status,
        rescheduledTo: ev?.rescheduledTo ?? (ev && ev.startTime !== item.startTime ? ev.startTime : undefined),
      }
    })
  })
}

/* ---------- v38 活动反馈（结束后提交） ---------- */

export async function fetchMyEventFeedback(eventId: string): Promise<MyEventFeedback | null> {
  return withLatency(() => {
    const uid = requireUid()
    return eventFeedbackByUid[uid]?.find((item) => item.eventId === eventId) ?? null
  }, 120)
}

export async function submitEventFeedback(eventId: string, payload: EventFeedbackPayload): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const ev = events.find((e) => e.id === eventId)
    if (!ev) fail(404, '活动不存在')
    if (ev.status !== 'ended') fail(409, '活动结束后才可提交反馈')
    const mine = (enrollmentsByUid[uid] ?? []).find((e) => e.eventId === eventId && e.status === 'approved')
    if (!mine) fail(403, '仅参与过该活动的成员可提交反馈')
    if (!Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5) fail(400, '请选择 1-5 星评分')
    const list = (eventFeedbackByUid[uid] ??= [])
    if (list.some((item) => item.eventId === eventId)) fail(409, '你已提交过反馈')
    list.unshift({ eventId, rating: payload.rating, comment: payload.comment?.trim() || undefined, at: nowStamp() })
    pushNotice(uid, { type: 'system', title: '反馈已提交', content: `感谢你对「${ev.title}」的反馈，运营将持续改进活动体验。` })
  }, 160)
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

export async function checkInEvent(id: string, payload: CheckinPayload): Promise<{ pointsAwarded: number }> {
  return withLatency(() => {
    const uid = requireUid()
    const ev = events.find((e) => e.id === id)
    if (!ev) fail(404, '活动不存在')
    const mine = (enrollmentsByUid[uid] ??= []).find((e) => e.eventId === id && e.status !== 'cancelled')
    if (!mine || mine.status !== 'approved') fail(400, '请先报名并通过审核后再签到')
    if (mine.checkedIn) fail(409, '该活动已签到过，请勿重复签到')
    if (ev.status === 'ended') fail(400, '活动已结束，无法签到')

    /* 时间窗：checkinOpenMin/checkinCloseMin 为相对开始时间的分钟偏移（与后端 app events 一致） */
    const now = mockNowDate()
    const startTs = parseMockStamp(ev.startTime).getTime()
    const openMin = ev.checkinOpenMin ?? 30
    const closeMin = ev.checkinCloseMin ?? 30
    if (now.getTime() < startTs - openMin * 60_000) fail(400, '当前不在签到时间范围内')
    if (now.getTime() > startTs + closeMin * 60_000) fail(400, '当前不在签到时间范围内')

    const distance = haversineM(payload.lat, payload.lng, ev.venueLat, ev.venueLng)
    if (distance > ev.checkinRadiusM) {
      fail(400, `签到失败：距场地约 ${distance} 米，超出签到范围（${ev.checkinRadiusM} 米）`)
    }

    mine.checkedIn = true
    mine.ticketRedeemed = true
    /* 签到积分 = checkinPoints ?? activity_checkin 规则值（Mock 规则值 10） */
    const pointsAwarded = ev.checkinPoints ?? 10
    grantPoints(uid, pointsAwarded, `活动签到：${ev.title}`, '活动签到')
    pushNotice(uid, { type: 'points', title: '签到成功', content: `「${ev.title}」签到成功，积分 +${pointsAwarded}。`, link: '/me/points' })
    trackMockEvent('event_checkin')
    return { pointsAwarded }
  })
}
