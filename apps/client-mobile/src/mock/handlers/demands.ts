import type { Demand, DemandCreatePayload, DemandKind, IdentityType, MyDemandItem, MyResponseItem } from '@/types'
import { accountByUid, demandMessagesByDemand, demands, dictLabel, dicts, enterpriseResponsesByEnterprise, enterprises, grantEnterpriseExperience, grantExperience, grantPoints, nextDemandId, nextMockId, nowStamp, projectsByUid, pushNotice, responsesByUid, trackMockEvent } from '@/mock/db'
import { permissionsOf } from '@/mock/handlers/enterprises'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'
import { appConfig } from '@/mock/db'
import { formatMockDate } from '@/mock/runtime'

/* [MOCK-ONLY] 需求广场 handlers。可见范围过滤（缺口 §7-9）在 Mock 中按身份/等级模拟；接入后为服务端 SQL 条件。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

/** 可见范围判定：空数组=不限；否则身份类型命中且（无等级要求 或 我的等级在集合内） */
export function visibleTo(demand: Demand, identities: { type: string; level?: number }[]): boolean {
  if (demand.visibilityIdentities.length === 0) return true
  return identities.some((i) => {
    if (!demand.visibilityIdentities.includes(i.type as never)) return false
    if (demand.visibilityLevels.length === 0) return true
    return i.level !== undefined && demand.visibilityLevels.includes(i.level)
  })
}

function myIdentitiesOf(): { type: string; level?: number }[] {
  const uid = readPayload()?.sub
  const account = uid ? accountByUid(uid) : undefined
  return account?.identities ?? [{ type: 'individual' }]
}

interface NormalizedDemand {
  kind: DemandKind
  title: string
  description: string
  categoryLabel: string
  contactName: string
  contactPhone: string
  contactEmail?: string
  publisherIdentity: IdentityType
  publisherName: string
  deliverable?: string
  budget?: string
  deliverBy?: string
  cooperationNeed?: string
  returnOffer?: string
  bottleneck?: string
  partnershipMode?: string
}

/** 创建与重提共用的字段校验（enforceFutureDate=false 用于重提历史内容）。 */
function normalizeDemandPayload(uid: string, payload: DemandCreatePayload, enforceFutureDate: boolean): NormalizedDemand {
  const kind = payload.kind
  if (kind !== 'task' && kind !== 'investment' && kind !== 'cooperation') fail(400, '请选择需求类型')
  const isTask = kind === 'task'
  const isInvest = kind === 'investment'
  const title = payload.title.trim()
  const description = payload.description.trim()
  if (!title) fail(400, isTask ? '请输入需求标题' : isInvest ? '请输入项目名称' : '请输入合作需求标题')
  if (!description) fail(400, isTask ? '请输入需求描述' : isInvest ? '请输入项目简介' : '请描述业务现状与瓶颈')
  if (!payload.categoryCode) fail(400, isTask ? '请选择需求类别' : isInvest ? '请选择所属行业' : '请选择合作领域')
  if (isTask && !payload.deliverable?.trim()) fail(400, '请输入期望交付')
  if (isTask && !payload.deliverBy) fail(400, '请选择预期交付日期')
  if (enforceFutureDate && payload.deliverBy && payload.deliverBy < formatMockDate()) fail(400, '预期交付日期不能早于今天')
  if (isInvest && !payload.cooperationNeed?.trim()) fail(400, '请输入希望获得的投资 / 合作')
  if (kind === 'cooperation' && !payload.bottleneck?.trim()) fail(400, '请描述业务瓶颈与合作诉求')
  const contactName = payload.contactName?.trim() ?? ''
  const contactPhone = payload.contactPhone?.trim() ?? ''
  const contactEmail = payload.contactEmail?.trim() ?? ''
  if (!contactName) fail(400, '请输入联系人')
  if (!/^1\d{10}$/.test(contactPhone)) fail(400, '请输入正确的联系电话')
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) fail(400, '请输入正确的联系邮箱')

  const account = accountByUid(uid)
  let identity = account?.identities.find((i) => i.type === payload.asIdentity) ?? account?.identities[0]
  /* 成员代企业发布：校验企业成员权限（publish_demand），主体快照为企业名 */
  let delegatedEnterpriseName = ''
  if (payload.asIdentity === 'community_enterprise' && payload.asEnterpriseId) {
    const ent = enterprises.find((x) => x.id === payload.asEnterpriseId)
    if (!ent) fail(404, '企业不存在')
    if (!permissionsOf(ent, uid).includes('publish_demand')) fail(403, '你没有代企业发布需求的权限')
    delegatedEnterpriseName = ent.name
    identity = { type: 'community_enterprise', enterpriseId: ent.id, enterpriseName: ent.name }
  }
  const publisherName =
    delegatedEnterpriseName ||
    (identity?.type === 'community_enterprise'
      ? (identity.enterpriseName ?? account?.nickname ?? '')
      : identity?.type === 'external_enterprise'
        ? (identity.organizationName ?? account?.nickname ?? '')
        : (account?.nickname ?? ''))
  return {
    kind, title, description,
    categoryLabel: dictLabel(payload.categoryDict, payload.categoryCode),
    contactName, contactPhone,
    ...(contactEmail ? { contactEmail } : {}),
    publisherIdentity: identity?.type ?? 'individual',
    publisherName,
    deliverable: payload.deliverable?.trim() || undefined,
    budget: payload.budget?.trim() || undefined,
    deliverBy: payload.deliverBy,
    cooperationNeed: payload.cooperationNeed?.trim() || undefined,
    returnOffer: payload.returnOffer?.trim() || undefined,
    bottleneck: payload.bottleneck?.trim() || undefined,
    partnershipMode: payload.partnershipMode?.trim() || undefined,
  }
}

export async function fetchDemands(query: { page?: number; pageSize?: number; category?: string; keyword?: string; kind?: DemandKind; sort?: 'latest' | 'hot' }): Promise<{ list: Demand[]; total: number }> {
  return withLatency(() => {
    let list = demands.filter((d) => d.status === 'published' && visibleTo(d, myIdentitiesOf()))
    if (query.kind) list = list.filter((d) => (d.kind ?? 'task') === query.kind)
    if (query.category) list = list.filter((d) => d.categoryLabel === query.category)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((d) => d.title.includes(kw) || d.description.includes(kw))
    }
    /* v40：排序（latest 保持种子/发布时间倒序，hot 按响应人数） */
    if (query.sort === 'hot') list = [...list].sort((a, b) => (b.responseCount ?? 0) - (a.responseCount ?? 0))
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, query.pageSize ?? 10)
    return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length }
  })
}

export async function fetchDemand(id: string): Promise<Demand> {
  return withLatency(() => {
    const d = demands.find((x) => x.id === id && (x.status === 'published' || x.status === 'projected'))
    if (!d || !visibleTo(d, myIdentitiesOf())) fail(404, '需求不存在或已下架')
    const uid = readPayload()?.sub
    const myResponses = uid ? (responsesByUid[uid] ?? []) : []
    return { ...d, myResponse: myResponses.some((r) => r.demandId === id) }
  })
}

export async function createDemand(payload: DemandCreatePayload): Promise<{ id: string }> {
  return withLatency(() => {
    const uid = requireUid()
    if (!appConfig.demandOpen) fail(400, '需求广场暂未开放')
    const n = normalizeDemandPayload(uid, payload, true)
    const id = nextDemandId()
    demands.unshift({
      id,
      title: n.title,
      description: n.description,
      kind: n.kind,
      categoryLabel: n.categoryLabel,
      status: 'pending',
      publisherUid: uid,
      publisherName: n.publisherName,
      publisherIdentity: n.publisherIdentity,
      contactName: n.contactName,
      contactPhone: n.contactPhone,
      ...(n.contactEmail ? { contactEmail: n.contactEmail } : {}),
      responseCount: 0,
      ...(payload.deadline ? { deadline: payload.deadline } : {}),
      ...(n.kind === 'task'
        ? { deliverable: n.deliverable, budget: n.budget, deliverBy: n.deliverBy }
        : n.kind === 'investment'
          ? { cooperationNeed: n.cooperationNeed, returnOffer: n.returnOffer }
          : { bottleneck: n.bottleneck, partnershipMode: n.partnershipMode, returnOffer: n.returnOffer }),
      visibilityIdentities: [], visibilityLevels: [],
      createdAt: nowStamp(),
    })
    trackMockEvent('demand_publish')
    return { id }
  })
}

/** 修改重提：仅本人已驳回/已撤回的需求；不加未来日期校验以允许保留历史内容。 */
export async function resubmitDemand(id: string, payload: DemandCreatePayload): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    if (!appConfig.demandOpen) fail(400, '需求广场暂未开放')
    const d = demands.find((x) => x.id === id && x.publisherUid === uid)
    if (!d) fail(404, '需求不存在')
    if (d.status !== 'rejected' && d.status !== 'withdrawn') fail(409, '仅已驳回或已撤回的需求可修改重提')
    const n = normalizeDemandPayload(uid, payload, false)
    d.title = n.title
    d.description = n.description
    d.kind = n.kind
    d.categoryLabel = n.categoryLabel
    d.status = 'pending'
    d.publisherName = n.publisherName
    d.publisherIdentity = n.publisherIdentity
    d.contactName = n.contactName
    d.contactPhone = n.contactPhone
    if (n.contactEmail) d.contactEmail = n.contactEmail
    else delete d.contactEmail
    d.deliverable = n.deliverable
    d.budget = n.budget
    d.deliverBy = n.deliverBy
    d.cooperationNeed = n.cooperationNeed
    d.returnOffer = n.returnOffer
    d.bottleneck = n.bottleneck
    d.partnershipMode = n.partnershipMode
    delete d.rejectReason
    d.createdAt = nowStamp()
  })
}

/** 撤回审核中的需求（pending → withdrawn）。 */
export async function withdrawDemand(id: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const d = demands.find((x) => x.id === id && x.publisherUid === uid)
    if (!d) fail(404, '需求不存在')
    if (d.status !== 'pending') fail(409, '仅审核中的需求可撤回')
    d.status = 'withdrawn'
  })
}

/** 驳回后申诉（一次性；运营复核后回写）。 */
export async function appealDemand(id: string, reason: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const d = demands.find((x) => x.id === id && x.publisherUid === uid)
    if (!d) fail(404, '需求不存在')
    if (d.status !== 'rejected') fail(409, '仅已驳回的需求可申诉')
    if (d.appealed) fail(409, '该需求已提交过申诉')
    if (!reason.trim()) fail(400, '请填写申诉理由')
    d.appealed = true
    d.appealReason = reason.trim()
    pushNotice(uid, { type: 'system', title: '申诉已提交', content: `「${d.title}」的申诉已提交，运营将在 3 个工作日内复核。`, link: '/me/demands' })
  })
}

/** 重提前回填表单：返回与发布表单一致的载荷。 */
export async function fetchMyDemandPayload(id: string): Promise<DemandCreatePayload> {
  return withLatency(() => {
    const uid = requireUid()
    const d = demands.find((x) => x.id === id && x.publisherUid === uid)
    if (!d) fail(404, '需求不存在')
    const kind = d.kind ?? 'task'
    const categoryDict: 'demand_category' | 'industry' = kind === 'investment' ? 'industry' : 'demand_category'
    const categoryCode = dicts[categoryDict]?.find((item) => item.label === d.categoryLabel)?.code ?? ''
    const account = accountByUid(uid)
    const enterpriseId = d.publisherIdentity === 'community_enterprise'
      ? account?.identities.find((item) => item.enterpriseName === d.publisherName)?.enterpriseId
      : undefined
    return {
      kind,
      title: d.title,
      description: d.description,
      categoryCode,
      categoryDict,
      deliverable: d.deliverable,
      budget: d.budget,
      deliverBy: d.deliverBy,
      cooperationNeed: d.cooperationNeed,
      returnOffer: d.returnOffer,
      bottleneck: d.bottleneck,
      partnershipMode: d.partnershipMode,
      asIdentity: d.publisherIdentity,
      ...(enterpriseId ? { asEnterpriseId: enterpriseId } : {}),
      contactName: d.contactName ?? '',
      contactPhone: d.contactPhone ?? '',
      ...(d.contactEmail ? { contactEmail: d.contactEmail } : {}),
    }
  })
}

export async function fetchMyDemands(): Promise<MyDemandItem[]> {
  return withLatency(() => {
    const uid = requireUid()
    return demands
      .filter((d) => d.publisherUid === uid)
      .map((d) => ({
        id: d.id, title: d.title, categoryLabel: d.categoryLabel, status: d.status, kind: d.kind,
        responseCount: d.responseCount, createdAt: d.createdAt, rejectReason: d.rejectReason,
      }))
  })
}

export async function respondDemand(id: string, note: string, asEnterpriseId?: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const d = demands.find((x) => x.id === id)
    if (!d || d.status !== 'published') fail(404, '需求不存在或已下架')
    if (d.publisherUid === uid) fail(409, '不可响应自己发布的需求')
    const mine = (responsesByUid[uid] ??= [])
    if (mine.some((r) => r.demandId === id)) fail(409, '你已响应过该需求')
    if (!note.trim()) fail(400, '请输入响应说明')
    /* v42：支持以社区企业身份响应（企业工作台可见） */
    const enterprise = asEnterpriseId ? enterprises.find((e) => e.id === asEnterpriseId) : undefined
    if (asEnterpriseId && !enterprise) fail(404, '企业不存在')
    mine.unshift({
      id: nextMockId('DR'), demandId: id, demandTitle: d.title, note: note.trim(), at: nowStamp(),
      responderUid: uid,
      responderName: enterprise?.name ?? accountByUid(uid)?.nickname ?? uid,
      responderIdentity: enterprise ? 'community_enterprise' : accountByUid(uid)?.identities.find((item) => item.type !== 'individual')?.type ?? 'individual',
      status: 'pending',
    })
    if (enterprise) {
      const list = (enterpriseResponsesByEnterprise[enterprise.id] ??= [])
      list.unshift({ id: nextMockId('ER'), demandId: id, demandTitle: d.title, at: nowStamp() })
    }
    d.responseCount += 1
    trackMockEvent('demand_respond')
    /* [MOCK-ONLY] 积分触发点：demand_responded（发放给响应成员，wiki §8.4） */
    grantPoints(uid, 20, '响应社区需求', '需求广场')
    if (d.publisherUid) pushNotice(d.publisherUid, { type: 'system', title: '收到新的需求响应', content: `「${d.title}」收到一条新的响应，请在我的需求中查看。`, link: '/me/demands' })
  })
}

/** v42 需求沟通消息（发布方与响应者可见） */
function assertCanMessage(demandId: string, uid: string): void {
  const d = demands.find((x) => x.id === demandId)
  if (!d) fail(404, '需求不存在或已下架')
  const isPublisher = d.publisherUid === uid
  const responded = (responsesByUid[uid] ?? []).some((r) => r.demandId === demandId)
  if (!isPublisher && !responded) fail(403, '仅需求发布方与响应者可沟通')
}

export async function fetchDemandMessages(demandId: string): Promise<import('@/types').DemandMessage[]> {
  return withLatency(() => {
    const uid = requireUid()
    assertCanMessage(demandId, uid)
    return (demandMessagesByDemand[demandId] ?? []).map((m) => ({ ...m, mine: m.uid === uid }))
  }, 140)
}

export async function sendDemandMessage(demandId: string, content: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    assertCanMessage(demandId, uid)
    if (!content.trim()) fail(400, '请输入消息内容')
    const list = (demandMessagesByDemand[demandId] ??= [])
    list.push({ id: nextMockId('DM'), uid, name: accountByUid(uid)?.nickname ?? uid, content: content.trim(), at: nowStamp(), mine: true })
  }, 160)
}

/** v42 需求沟通消息（发布方与响应者可见） */



export async function fetchMyResponses(): Promise<MyResponseItem[]> {
  return withLatency(() => {
    const uid = requireUid()
    return [...(responsesByUid[uid] ?? [])]
  })
}

/** 响应者撤回待处理响应（撤回后可重新响应）。 */
export async function withdrawDemandResponse(responseId: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const mine = (responsesByUid[uid] ??= [])
    const index = mine.findIndex((item) => item.id === responseId)
    if (index < 0) fail(404, '响应记录不存在')
    const response = mine[index]
    if (response.status && response.status !== 'pending') fail(409, '已处理的响应不可撤回')
    const demand = demands.find((item) => item.id === response.demandId)
    if (demand && demand.responseCount > 0) demand.responseCount -= 1
    mine.splice(index, 1)
    if (demand?.publisherUid && demand.status === 'published') {
      pushNotice(demand.publisherUid, { type: 'system', title: '需求响应已撤回', content: `「${demand.title}」有一条响应被撤回。`, link: '/me/demands' })
    }
  })
}

export async function fetchDemandResponses(id: string): Promise<MyResponseItem[]> {
  return withLatency(() => {
    const uid = requireUid()
    const demand = demands.find((item) => item.id === id)
    if (!demand || demand.publisherUid !== uid) fail(403, '仅需求发布者可查看响应')
    return Object.values(responsesByUid).flat().filter((item) => item.demandId === id).map((item) => ({ ...item }))
  })
}

export async function reviewDemandResponse(id: string, responseId: string, action: 'accept' | 'reject', reason = ''): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const demand = demands.find((item) => item.id === id)
    if (!demand || demand.publisherUid !== uid) fail(403, '仅需求发布者可处理响应')
    if (demand.status !== 'published') fail(409, '该需求当前不可处理响应')
    const entry = Object.entries(responsesByUid).find(([, records]) => records.some((item) => item.id === responseId && item.demandId === id))
    if (!entry) fail(404, '响应记录不存在')
    const [responderUid, records] = entry
    const response = records.find((item) => item.id === responseId)!
    if (response.status !== 'pending') fail(409, '该响应已处理')
    if (action === 'reject') {
      if (!reason.trim()) fail(400, '驳回响应时请填写原因')
      response.status = 'rejected'
      response.reviewedAt = nowStamp()
      response.rejectReason = reason.trim()
      pushNotice(responderUid, { type: 'audit_result', title: '需求响应未通过', content: `你对「${demand.title}」的响应未通过：${reason.trim()}`, link: '/me/responses' })
      return
    }
    if (demand.projectId) fail(409, '该需求已完成立项')
    demand.status = 'projected'
    for (const candidate of Object.values(responsesByUid).flat()) {
      if (candidate.demandId !== id) continue
      if (candidate.id === responseId) {
        candidate.status = 'accepted'
        candidate.reviewedAt = nowStamp()
      } else if (candidate.status === 'pending') {
        candidate.status = 'rejected'
        candidate.reviewedAt = nowStamp()
        candidate.rejectReason = '需求已选择其他响应方'
        if (candidate.responderUid) pushNotice(candidate.responderUid, { type: 'audit_result', title: '需求响应未通过', content: `「${demand.title}」已选择其他响应方。`, link: '/me/responses' })
      }
    }
    const responderName = response.responderName ?? accountByUid(responderUid)?.nickname ?? responderUid
    const projectId = nextMockId('P')
    const milestones = [{ id: nextMockId('MS'), title: '合作方案确认', done: false }, { id: nextMockId('MS'), title: '项目交付', done: false }]
    ;(projectsByUid[demand.publisherUid!] ??= []).unshift({
      id: projectId, name: demand.title, role: '需求发起方', sourceDemandId: demand.id, partnerName: responderName,
      progress: 0, milestones,
    })
    const responderIdentity = accountByUid(responderUid)?.identities.find((item) => item.type === response.responderIdentity)
    ;(projectsByUid[responderUid] ??= []).unshift({
      id: projectId, name: demand.title, role: responderIdentity?.type === 'community_enterprise' ? '企业承接' : '本人承接',
      enterpriseName: responderIdentity?.enterpriseName, enterpriseId: responderIdentity?.enterpriseId,
      sourceDemandId: demand.id, partnerName: demand.publisherName,
      progress: 0, milestones: milestones.map((item) => ({ ...item })),
    })
    demand.projectId = projectId
    grantPoints(responderUid, 200, `承接需求：${demand.title}`, '项目立项')
    if (responderIdentity?.type === 'community_enterprise' && responderIdentity.enterpriseId) {
      grantEnterpriseExperience(responderIdentity.enterpriseId, 30, `承接项目：${demand.title}`)
    } else {
      grantExperience(responderUid, 30, `承接项目：${demand.title}`)
    }
    pushNotice(responderUid, { type: 'audit_result', title: '需求响应已被接受', content: `你已承接「${demand.title}」，项目已立项，积分 +200。`, link: '/me/projects' })
    pushNotice(uid, { type: 'system', title: '需求已立项', content: `已接受「${responderName}」的响应，「${demand.title}」已生成协作项目。`, link: '/me/projects' })
  })
}
