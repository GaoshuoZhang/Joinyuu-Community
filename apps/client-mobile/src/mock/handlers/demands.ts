import type { Demand, DemandCreatePayload, MyDemandItem, MyResponseItem } from '@/types'
import { accountByUid, demands, dictLabel, grantPoints, nextDemandId, responsesByUid } from '@/mock/db'
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

export async function fetchDemands(query: { page?: number; pageSize?: number; category?: string; keyword?: string }): Promise<{ list: Demand[]; total: number }> {
  return withLatency(() => {
    let list = demands.filter((d) => d.status === 'published' && visibleTo(d, myIdentitiesOf()))
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
    const title = payload.title.trim()
    const description = payload.description.trim()
    if (!title) fail(400, '请输入需求标题')
    if (!description) fail(400, '请输入需求描述')
    if (!payload.deadline) fail(400, '请选择截止日期')
    const account = accountByUid(uid)
    const identity = account?.identities.find((i) => i.type === payload.asIdentity) ?? account?.identities[0]
    const id = nextDemandId()
    demands.unshift({
      id, title, description,
      categoryLabel: dictLabel('demand_category', payload.categoryCode),
      status: 'pending',
      publisherUid: uid,
      publisherName: account?.nickname ?? '',
      publisherIdentity: identity?.type ?? 'individual',
      deadline: payload.deadline, responseCount: 0,
      visibilityIdentities: [], visibilityLevels: [],
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16),
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
        id: d.id, title: d.title, categoryLabel: d.categoryLabel, status: d.status,
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
    mine.unshift({ id: `DR${Date.now()}`, demandId: id, demandTitle: d.title, note: note.trim(), at: new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16) })
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
