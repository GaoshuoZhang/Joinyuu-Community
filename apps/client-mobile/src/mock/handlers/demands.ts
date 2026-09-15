import type { Demand, DemandKind, DemandCreatePayload, MyDemandItem, MyResponseItem } from '@/types'
import { accountByUid, demands, dictLabel, enterprises, grantPoints, nextDemandId, nowStamp, responsesByUid } from '@/mock/db'
import { permissionsOf } from '@/mock/handlers/enterprises'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'
import { appConfig } from '@/mock/db'

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

export async function fetchDemands(query: { page?: number; pageSize?: number; category?: string; keyword?: string; kind?: DemandKind }): Promise<{ list: Demand[]; total: number }> {
  return withLatency(() => {
    let list = demands.filter((d) => d.status === 'published' && visibleTo(d, myIdentitiesOf()))
    if (query.kind) list = list.filter((d) => (d.kind ?? 'task') === query.kind)
    if (query.category) list = list.filter((d) => d.categoryLabel === query.category)
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((d) => d.title.includes(kw) || d.description.includes(kw))
    }
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, query.pageSize ?? 10)
    return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length }
  })
}

export async function fetchDemand(id: string): Promise<Demand> {
  return withLatency(() => {
    const d = demands.find((x) => x.id === id && x.status === 'published')
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
    /* 主体快照：企业身份以企业名/组织名发布（个人身份存昵称） */
    const publisherName =
      delegatedEnterpriseName ||
      (identity?.type === 'community_enterprise'
        ? (identity.enterpriseName ?? account?.nickname ?? '')
        : identity?.type === 'external_enterprise'
          ? (identity.organizationName ?? account?.nickname ?? '')
          : (account?.nickname ?? ''))
    const id = nextDemandId()
    demands.unshift({
      id, title, description,
      kind,
      categoryLabel: dictLabel(payload.categoryDict, payload.categoryCode),
      status: 'pending',
      publisherUid: uid,
      publisherName,
      publisherIdentity: identity?.type ?? 'individual',
      contactName, contactPhone,
      ...(contactEmail ? { contactEmail } : {}),
      responseCount: 0,
      ...(payload.deadline ? { deadline: payload.deadline } : {}),
      ...(isTask
        ? { deliverable: payload.deliverable?.trim(), budget: payload.budget?.trim() || undefined, deliverBy: payload.deliverBy }
        : isInvest
          ? { cooperationNeed: payload.cooperationNeed?.trim(), returnOffer: payload.returnOffer?.trim() || undefined }
          : {
              bottleneck: payload.bottleneck?.trim(),
              partnershipMode: payload.partnershipMode?.trim() || undefined,
              returnOffer: payload.returnOffer?.trim() || undefined,
            }),
      visibilityIdentities: [], visibilityLevels: [],
      createdAt: nowStamp(),
    })
    return { id }
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

export async function respondDemand(id: string, note: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const d = demands.find((x) => x.id === id)
    if (!d || d.status !== 'published') fail(404, '需求不存在或已下架')
    if (d.publisherUid === uid) fail(409, '不可响应自己发布的需求')
    const mine = (responsesByUid[uid] ??= [])
    if (mine.some((r) => r.demandId === id)) fail(409, '你已响应过该需求')
    if (!note.trim()) fail(400, '请输入响应说明')
    mine.unshift({ id: `DR${Date.now()}`, demandId: id, demandTitle: d.title, note: note.trim(), at: nowStamp() })
    d.responseCount += 1
    /* [MOCK-ONLY] 积分触发点：demand_responded（发放给响应成员，wiki §8.4） */
    grantPoints(uid, 20, '响应社区需求', '需求广场')
  })
}

export async function fetchMyResponses(): Promise<MyResponseItem[]> {
  return withLatency(() => {
    const uid = requireUid()
    return [...(responsesByUid[uid] ?? [])]
  })
}
