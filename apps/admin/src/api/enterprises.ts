import type { Enterprise, PageResult, User } from '@/types'
import { demands, enterprises, projects, users } from '@/mock'
import { delay } from './utils'

export interface EnterpriseQuery {
  page: number
  pageSize: number
  keyword?: string
  industry?: string
  status?: string
}

/* TODO: 替换为 GET /api/admin/enterprises?page&pageSize&keyword&industry&status */
export async function fetchEnterprises(query: EnterpriseQuery): Promise<PageResult<Enterprise>> {
  await delay(400)
  let list = [...enterprises]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter((e) => e.name.toLowerCase().includes(kw) || e.id.toLowerCase().includes(kw))
  }
  if (query.industry) list = list.filter((e) => e.industry === query.industry)
  if (query.status) list = list.filter((e) => e.status === query.status)
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 GET /api/admin/enterprises/:id
 * 返回企业详情 + 成员列表（成员 = 持有该企业 community_enterprise 身份的用户）
 */
export async function fetchEnterprise(id: string): Promise<{ enterprise: Enterprise; members: User[] }> {
  await delay(300)
  const enterprise = enterprises.find((e) => e.id === id)
  if (!enterprise) throw new Error('企业不存在')
  const members = users.filter((u) =>
    u.identities.some((i) => i.type === 'community_enterprise' && i.enterpriseId === id),
  )
  return { enterprise, members }
}

/* TODO: 替换为 PATCH /api/admin/enterprises/:id/showcase-status，入参 { status, comment }
 * 展示页审核：published / rejected / pending
 */
export async function reviewShowcase(
  id: string,
  status: Enterprise['showcaseStatus'],
  comment?: string,
): Promise<{ code: number }> {
  await delay(350)
  const enterprise = enterprises.find((e) => e.id === id)
  if (!enterprise) throw new Error('企业不存在')
  enterprise.showcaseStatus = status
  if (status === 'rejected' && comment) enterprise.showcaseComment = comment
  return { code: 0 }
}

export interface EnterpriseStats {
  /** 该企业（社区企业身份）发布的需求量 */
  demandCount: number
  /** 该企业承接/参与的项目量 */
  projectCount: number
}

/* TODO: 替换为 GET /api/admin/enterprises/:id/stats — 企业数据概览 */
export async function fetchEnterpriseStats(id: string): Promise<EnterpriseStats> {
  await delay(300)
  const demandCount = demands.filter(
    (d) => d.publisherIdentity?.type === 'community_enterprise' && d.publisherIdentity.enterpriseId === id,
  ).length
  const projectCount = projects.filter((p) =>
    p.undertakers.some((t) => t.type === 'enterprise' && t.id === id),
  ).length
  return { demandCount, projectCount }
}
