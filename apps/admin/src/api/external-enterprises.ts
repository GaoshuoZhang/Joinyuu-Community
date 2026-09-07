import type { ExternalEnterprise, PageResult } from '@/types'
import { demands, externalEnterpriseProfiles, projects, users } from '@/mock'
import { delay } from './utils'

export interface ExternalEnterpriseQuery {
  page: number
  pageSize: number
  keyword?: string
  industry?: string
  /** 排序字段：cooperationCount（累计合作，默认倒序=合作最多在前）| firstCooperationAt（首次合作） */
  sortBy?: 'cooperationCount' | 'firstCooperationAt'
  sortOrder?: 'ascend' | 'descend'
}

/* 外部企业 = 档案（含唯一 ID）+ 用户 external_enterprise 身份聚合成员，非入驻实体，无展示页 */
function aggregate(profile: (typeof externalEnterpriseProfiles)[number]): ExternalEnterprise {
  const members = []
  for (const u of users) {
    for (const identity of u.identities) {
      if (identity.type === 'external_enterprise' && identity.enterpriseName === profile.name) {
        members.push({
          userId: u.id,
          name: u.name,
          title: identity.title,
          phone: u.phone,
          status: u.status,
        })
      }
    }
  }
  return {
    id: profile.id,
    name: profile.name,
    industry: profile.industry,
    description: profile.description,
    cooperationCount: profile.cooperationCount,
    firstCooperationAt: profile.firstCooperationAt,
    members,
  }
}

/* TODO: 替换为 GET /api/admin/external-enterprises?page&pageSize&keyword&industry */
export async function fetchExternalEnterprises(
  query: ExternalEnterpriseQuery,
): Promise<PageResult<ExternalEnterprise>> {
  await delay(400)
  let list = externalEnterpriseProfiles.map((p) => aggregate(p))
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter((e) => e.name.toLowerCase().includes(kw) || e.industry.toLowerCase().includes(kw) || e.id.toLowerCase().includes(kw))
  }
  if (query.industry) list = list.filter((e) => e.industry === query.industry)
  /* 排序：默认累计合作倒序（合作最多在前），可按累计合作/首次合作正倒序（时间格式 YYYY-MM 可直接数值比较） */
  const field = query.sortBy ?? 'cooperationCount'
  const dir = query.sortOrder === 'ascend' ? 1 : -1
  list.sort((a, b) => {
    const av = field === 'cooperationCount' ? a.cooperationCount : Number(a.firstCooperationAt.replace('-', ''))
    const bv = field === 'cooperationCount' ? b.cooperationCount : Number(b.firstCooperationAt.replace('-', ''))
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 GET /api/admin/external-enterprises/:id — 外部企业详情（按 ID 查询，含关联成员） */
export async function fetchExternalEnterprise(id: string): Promise<ExternalEnterprise> {
  await delay(300)
  const profile = externalEnterpriseProfiles.find((p) => p.id === id)
  if (!profile) throw new Error('外部企业不存在')
  return aggregate(profile)
}

export interface ExternalEnterpriseStats {
  /** 该企业（外部企业身份）发布的需求量 */
  demandCount: number
  /** 其成员以个人身份承接的项目量 */
  projectCount: number
}

/* TODO: 替换为 GET /api/admin/external-enterprises/:id/stats — 外部企业数据概览 */
export async function fetchExternalEnterpriseStats(id: string): Promise<ExternalEnterpriseStats> {
  await delay(300)
  const profile = externalEnterpriseProfiles.find((p) => p.id === id)
  if (!profile) throw new Error('外部企业不存在')
  const demandCount = demands.filter(
    (d) => d.publisherIdentity?.type === 'external_enterprise' && d.publisherIdentity.enterpriseName === profile.name,
  ).length
  const memberIds = users
    .filter((u) => u.identities.some((i) => i.type === 'external_enterprise' && i.enterpriseName === profile.name))
    .map((u) => u.id)
  const projectCount = projects.filter((p) =>
    p.undertakers.some((t) => t.type === 'individual' && memberIds.includes(t.id)),
  ).length
  return { demandCount, projectCount }
}
