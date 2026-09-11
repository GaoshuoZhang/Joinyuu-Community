import type { PageResult, User } from '@/types'
import { httpGet } from './http'

export interface IndividualQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
}

/* GET /api/admin/individuals?page&pageSize&keyword&status
 * 社区个体 = 持有 community_individual 身份的用户（该身份每人至多一个）
 */
export async function fetchIndividuals(query: IndividualQuery): Promise<PageResult<User>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.status) qs.set('status', query.status)
  return httpGet<PageResult<User>>(`/individuals?${qs}`)
}
