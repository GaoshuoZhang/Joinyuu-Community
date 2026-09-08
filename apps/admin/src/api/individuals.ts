import type { PageResult, User } from '@/types'
import { users } from '@/mock'
import { delay } from './utils'

export interface IndividualQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
}

/* TODO: 替换为 GET /api/admin/individuals?page&pageSize&keyword&status
 * 社区个人 = 持有 community_individual 身份的用户（该身份每人至多一个）
 */
export async function fetchIndividuals(query: IndividualQuery): Promise<PageResult<User>> {
  await delay(400)
  let list = users.filter((u) => u.identities.some((i) => i.type === 'community_individual'))
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter(
      (u) => u.nickname.toLowerCase().includes(kw) || u.uid.toLowerCase().includes(kw) || u.phone.includes(kw),
    )
  }
  if (query.status) list = list.filter((u) => u.status === query.status)
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}
