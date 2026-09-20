import type { ApplicationCreatePayload, EnterpriseRecord, UserIdentity } from '@/types'
import {
  accountByUid,
  articlePayloadById,
  applicationPayloadById,
  applicationsByUid,
  demands,
  enrollmentsByUid,
  enterprises,
  events,
  grantEnterpriseExperience,
  grantExperience,
  grantPoints,
  myArticlesByUid,
  nextMockId,
  nowStamp,
  occupiedSlots,
  pushNotice,
  reservationsByUid,
  talentMembers,
} from '@/mock/db'
import { fail } from '@/mock/latency'
import { commitMockState } from '@/mock/runtime'

/* [MOCK-ONLY] v34 运营审核模拟器：只服务 DevTools，不进入 /api/app/** 契约。 */
export type MockReviewDomain = 'demand' | 'application' | 'enrollment' | 'reservation' | 'article'
export type MockReviewVerdict = 'approved' | 'rejected'

export interface MockReviewItem {
  domain: MockReviewDomain
  domainLabel: string
  id: string
  ownerUid: string
  ownerName: string
  title: string
  detail: string
}

const DOMAIN_LABEL: Record<MockReviewDomain, string> = {
  demand: '需求',
  application: '申请',
  enrollment: '活动报名',
  reservation: '空间预约',
  article: '投稿',
}

function ownerName(uid: string): string {
  return accountByUid(uid)?.nickname ?? uid
}

export function listPendingReviews(): MockReviewItem[] {
  const result: MockReviewItem[] = []
  for (const demand of demands.filter((item) => item.status === 'pending')) {
    const uid = demand.publisherUid ?? ''
    result.push({ domain: 'demand', domainLabel: DOMAIN_LABEL.demand, id: demand.id, ownerUid: uid, ownerName: ownerName(uid), title: demand.title, detail: demand.categoryLabel })
  }
  for (const [uid, records] of Object.entries(applicationsByUid)) {
    for (const item of records.filter((record) => record.status === 'pending')) {
      result.push({ domain: 'application', domainLabel: DOMAIN_LABEL.application, id: item.id, ownerUid: uid, ownerName: ownerName(uid), title: item.targetName, detail: item.summary ?? item.type })
    }
  }
  for (const [uid, records] of Object.entries(enrollmentsByUid)) {
    for (const item of records.filter((record) => record.status === 'pending')) {
      result.push({ domain: 'enrollment', domainLabel: DOMAIN_LABEL.enrollment, id: item.id, ownerUid: uid, ownerName: ownerName(uid), title: item.eventTitle, detail: item.startTime })
    }
  }
  for (const [uid, records] of Object.entries(reservationsByUid)) {
    for (const item of records.filter((record) => record.status === 'pending')) {
      result.push({ domain: 'reservation', domainLabel: DOMAIN_LABEL.reservation, id: item.id, ownerUid: uid, ownerName: ownerName(uid), title: item.spaceName, detail: `${item.date} ${item.start}-${item.end}` })
    }
  }
  for (const [uid, records] of Object.entries(myArticlesByUid)) {
    for (const item of records.filter((record) => record.status === 'pending')) {
      result.push({ domain: 'article', domainLabel: DOMAIN_LABEL.article, id: item.id, ownerUid: uid, ownerName: ownerName(uid), title: item.title, detail: item.columnLabel })
    }
  }
  return result
}

function addIdentityFromApplication(uid: string, payload: ApplicationCreatePayload, targetName: string): UserIdentity | null {
  const account = accountByUid(uid)
  if (!account) fail(404, '申请人不存在')
  const type = payload.type
  let identity: UserIdentity | undefined

  if (type === 'individual') {
    identity = { type: 'community_individual', level: 1, levelName: '新芽', experience: 0 }
  } else if (type === 'cooperation') {
    const organizationName = String(payload.fields?.orgName ?? targetName.split(' · ')[0]).trim()
    identity = { type: 'external_enterprise', organizationName }
  } else if (type === 'settle') {
    const fields = payload.fields ?? {}
    const enterpriseName = String(fields.companyName ?? targetName).trim()
    if (enterprises.some((item) => item.name === enterpriseName)) fail(409, '企业名称已存在，请改为申请绑定已有社区企业')
    const enterprise = {
        id: nextMockId('E'),
        name: enterpriseName,
        industry: String(fields.industry ?? '综合'),
        size: String(fields.companySize ?? '1-9 人'),
        description: String(fields.intro ?? '申请入驻的社区企业'),
        contactUid: uid,
        contactName: account.nickname,
        members: [{ uid, name: account.nickname, role: '负责人', phone: account.phone }],
    } satisfies EnterpriseRecord
    enterprises.push(enterprise)
    identity = { type: 'community_enterprise', enterpriseId: enterprise.id, enterpriseName: enterprise.name, enterpriseRole: '负责人' }
  }

  if (!identity) return null
  const duplicate = account.identities.some((item) => item.type === identity.type && item.enterpriseId === identity.enterpriseId && item.organizationName === identity.organizationName)
  if (duplicate) return null
  account.identities.push(identity)
  if (identity.type === 'community_individual' && !talentMembers.some((item) => item.uid === uid)) {
    const fields = payload.fields ?? {}
    talentMembers.unshift({
      uid,
      name: String(fields.realName ?? account.realName ?? account.nickname),
      role: String(fields.skills ?? '社区人才'),
      intro: String(fields.intro ?? account.bio ?? '新加入的社区个体'),
      skills: String(fields.skills ?? '').split(/[、,，/]/).map((item) => item.trim()).filter(Boolean),
    })
  }
  return identity
}

function reviewDemand(id: string, verdict: MockReviewVerdict, reason: string): string {
  const item = demands.find((demand) => demand.id === id)
  if (!item) fail(404, '需求不存在')
  if (item.status !== 'pending') fail(409, '该需求已处理')
  const uid = item.publisherUid ?? ''
  if (verdict === 'approved') {
    /* 审核通过仅转待发布；实际发布由运营/定时任务完成（对齐后端 demand 状态机） */
    item.status = 'pending_release'
    delete item.rejectReason
    grantPoints(uid, 15, `发布需求：${item.title}`, '需求广场')
    pushNotice(uid, { type: 'audit_result', title: '需求审核通过', content: `「${item.title}」已通过审核，等待发布。`, link: '/me/demands' })
    return '需求已通过并转待发布'
  }
  item.status = 'rejected'
  item.rejectReason = reason
  pushNotice(uid, { type: 'audit_result', title: '需求审核未通过', content: `「${item.title}」未通过：${reason}`, link: '/me/demands' })
  return '需求已驳回'
}

function reviewApplication(id: string, verdict: MockReviewVerdict, reason: string): string {
  const entry = Object.entries(applicationsByUid).find(([, records]) => records.some((item) => item.id === id))
  if (!entry) fail(404, '申请不存在')
  const [uid, records] = entry
  const item = records.find((record) => record.id === id)!
  if (item.status !== 'pending') fail(409, '该申请已处理')
  item.records ??= []
  if (verdict === 'approved') {
    const snapshot = applicationPayloadById[id]
    const added = addIdentityFromApplication(uid, snapshot?.payload ?? ({ type: item.type } as ApplicationCreatePayload), item.targetName)
    item.status = 'approved'
    item.reviewedAt = nowStamp()
    item.records.push({ at: item.reviewedAt, action: 'approve', title: '审核通过', text: reason || '同意', operator: '社区管理员' })
    delete item.rejectReason
    if (added) {
      grantPoints(uid, 50, '首次绑定社区身份', '身份授予')
      if (added.type === 'community_enterprise' && added.enterpriseId) grantEnterpriseExperience(added.enterpriseId, 10, '首次绑定社区身份')
      if (added.type === 'community_individual') grantExperience(uid, 10, '首次绑定社区身份')
    }
    pushNotice(uid, { type: 'audit_result', title: '申请审核通过', content: `「${item.targetName}」已审核通过${added ? '，关联身份已生效' : ''}。`, link: '/me/applications' })
    return added ? '申请已通过并授予身份' : '申请已通过'
  }
  item.status = 'rejected'
  item.reviewedAt = nowStamp()
  item.rejectReason = reason
  item.records.push({ at: item.reviewedAt, action: 'reject', title: '审核驳回', text: reason, operator: '社区管理员' })
  pushNotice(uid, { type: 'audit_result', title: '申请审核未通过', content: `「${item.targetName}」未通过：${reason}`, link: '/me/applications' })
  return '申请已驳回'
}

function reviewEnrollment(id: string, verdict: MockReviewVerdict, reason: string): string {
  const entry = Object.entries(enrollmentsByUid).find(([, records]) => records.some((item) => item.id === id))
  if (!entry) fail(404, '报名记录不存在')
  const [uid, records] = entry
  const item = records.find((record) => record.id === id)!
  if (item.status !== 'pending') fail(409, '该报名已处理')
  const event = events.find((candidate) => candidate.id === item.eventId)
  if (!event) fail(404, '活动不存在')
  if (verdict === 'approved') {
    if (event.approvedCount >= event.capacity) fail(409, '活动名额已满，无法通过该报名')
    item.status = 'approved'
    delete item.rejectReason
    event.approvedCount += 1
    /* 报名审核通过仅发放积分（activity_enroll_approved），不发放经验 */
    grantPoints(uid, 5, `报名审核通过：${event.title}`, '活动报名')
    pushNotice(uid, { type: 'enroll_result', title: '报名审核通过', content: `你报名的「${event.title}」已通过审核。`, link: '/me/enrollments' })
    return '报名已通过'
  }
  item.status = 'rejected'
  item.rejectReason = reason
  pushNotice(uid, { type: 'enroll_result', title: '报名审核未通过', content: `「${event.title}」报名未通过：${reason}`, link: '/me/enrollments' })
  return '报名已驳回'
}

function reviewReservation(id: string, verdict: MockReviewVerdict, reason: string): string {
  const entry = Object.entries(reservationsByUid).find(([, records]) => records.some((item) => item.id === id))
  if (!entry) fail(404, '预约记录不存在')
  const [uid, records] = entry
  const item = records.find((record) => record.id === id)!
  if (item.status !== 'pending') fail(409, '该预约已处理')
  item.records ??= []
  if (verdict === 'approved') {
    /* 冲突判定排除待审核记录自身，否则永远与自己冲突 */
    const conflict = occupiedSlots(item.spaceId, item.date, item.id).some((slot) => slot.start < item.end && item.start < slot.end)
    if (conflict) fail(409, '该时段已有占用，无法通过预约')
    item.status = 'approved'
    item.records.push({ at: nowStamp(), action: 'approve', title: '管理员审核', text: reason || '同意预约', operator: '社区管理员' })
    delete item.rejectReason
    pushNotice(uid, { type: 'audit_result', title: '空间预约审核通过', content: `「${item.spaceName}」${item.date} ${item.start}-${item.end} 已预约成功。`, link: '/me/reservations' })
    return '预约已通过'
  }
  item.status = 'rejected'
  item.rejectReason = reason
  item.records.push({ at: nowStamp(), action: 'reject', title: '管理员审核', text: reason, operator: '社区管理员' })
  pushNotice(uid, { type: 'audit_result', title: '空间预约未通过', content: `「${item.spaceName}」预约未通过：${reason}`, link: '/me/reservations' })
  return '预约已驳回'
}

function reviewArticle(id: string, verdict: MockReviewVerdict, reason: string): string {
  const entry = Object.entries(myArticlesByUid).find(([, records]) => records.some((item) => item.id === id))
  if (!entry) fail(404, '投稿不存在')
  const [uid, records] = entry
  const item = records.find((record) => record.id === id)!
  if (item.status !== 'pending') fail(409, '该投稿已处理')
  if (verdict === 'approved') {
    item.status = 'pending_release'
    delete item.rejectReason
    grantPoints(uid, 30, `投稿审核通过：${item.title}`, '内容中心')
    const payload = articlePayloadById[id]?.payload
    if (payload?.asIdentity === 'community_enterprise' && payload.asEnterpriseId) {
      grantEnterpriseExperience(payload.asEnterpriseId, 20, `投稿审核通过：${item.title}`)
    } else {
      grantExperience(uid, 20, `投稿审核通过：${item.title}`)
    }
    pushNotice(uid, { type: 'audit_result', title: '投稿审核通过', content: `「${item.title}」已转入待发布。`, link: '/me/articles' })
    return '投稿已通过并转待发布'
  }
  item.status = 'rejected'
  item.rejectReason = reason
  pushNotice(uid, { type: 'audit_result', title: '投稿审核未通过', content: `「${item.title}」未通过：${reason}`, link: '/me/articles' })
  return '投稿已驳回'
}

/* [MOCK-ONLY] v40 活动运营模拟（DevTools）：取消 / 改期并通知全部报名者。 */

export async function cancelEventAsOps(id: string, reason = '活动调整'): Promise<string> {
  const ev = events.find((item) => item.id === id)
  if (!ev) fail(404, '活动不存在')
  if (ev.status === 'ended') fail(409, '已结束活动不可取消')
  ev.status = 'cancelled'
  let notified = 0
  for (const [uid, list] of Object.entries(enrollmentsByUid)) {
    const mine = list.find((item) => item.eventId === id && item.status !== 'cancelled')
    if (!mine) continue
    mine.status = 'cancelled'
    delete mine.waitlistOrder
    pushNotice(uid, { type: 'enroll_result', title: '活动已取消', content: `「${ev.title}」已取消：${reason}。报名已同步取消。`, link: '/me/enrollments' })
    notified += 1
  }
  commitMockState()
  return `活动已取消，通知 ${notified} 位报名者`
}

export async function postponeEventAsOps(id: string, days = 1): Promise<string> {
  const ev = events.find((item) => item.id === id)
  if (!ev) fail(404, '活动不存在')
  if (ev.status !== 'published') fail(409, '仅已发布活动可改期')
  const shift = (value: string): string => {
    const [date, time = '00:00'] = value.trim().split(' ')
    const d = new Date(...(date.split('-').map((part, index) => (index === 1 ? Number(part) - 1 : Number(part))) as [number, number, number]))
    d.setDate(d.getDate() + days)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`
  }
  ev.startTime = shift(ev.startTime)
  ev.endTime = shift(ev.endTime)
  /* 对齐后端改期：记录 rescheduledTo 供「我的报名」提示，不调整报名截止时间 */
  ev.rescheduledTo = ev.startTime
  let notified = 0
  for (const [uid, list] of Object.entries(enrollmentsByUid)) {
    const mine = list.find((item) => item.eventId === id && (item.status === 'approved' || item.status === 'pending' || item.status === 'waitlisted'))
    if (!mine) continue
    pushNotice(uid, { type: 'enroll_result', title: '活动时间已调整', content: `「${ev.title}」改期至 ${ev.startTime}，请留意行程。`, link: '/me/enrollments' })
    notified += 1
  }
  commitMockState()
  return `活动改期至 ${ev.startTime}，通知 ${notified} 位报名者`
}

export function reviewPending(domain: MockReviewDomain, id: string, verdict: MockReviewVerdict, reason = ''): string {
  const normalizedReason = reason.trim()
  if (verdict === 'rejected' && !normalizedReason) fail(400, '驳回时请填写原因')
  let message = ''
  if (domain === 'demand') message = reviewDemand(id, verdict, normalizedReason)
  if (domain === 'application') message = reviewApplication(id, verdict, normalizedReason)
  if (domain === 'enrollment') message = reviewEnrollment(id, verdict, normalizedReason)
  if (domain === 'reservation') message = reviewReservation(id, verdict, normalizedReason)
  if (domain === 'article') message = reviewArticle(id, verdict, normalizedReason)
  if (!message) fail(400, '审核类型无效')
  commitMockState()
  return message
}
