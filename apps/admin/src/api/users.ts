import type { PageResult, User } from '@/types'
import { demands, events, projects, users } from '@/mock'
import { delay } from './utils'

export interface UserQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
  /** 身份筛选：individual=个人用户（仅持有基础个人身份）| community_individual | community_enterprise | external_enterprise */
  category?: string
}

/* TODO: 替换为 GET /api/admin/users?page&pageSize&keyword&status&category
 * 返回 { code: 0, data: { list, total } }
 */
export async function fetchUsers(query: UserQuery): Promise<PageResult<User>> {
  await delay(400)
  let list = [...users]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter(
      (u) => u.name.toLowerCase().includes(kw) || u.id.toLowerCase().includes(kw) || u.phone.includes(kw),
    )
  }
  if (query.status) list = list.filter((u) => u.status === query.status)
  if (query.category === 'individual') {
    /* 个人用户 = 仅持有基础个人身份，未关联其他身份 */
    list = list.filter((u) => u.identities.every((i) => i.type === 'individual'))
  } else if (query.category) {
    list = list.filter((u) => u.identities.some((i) => i.type === query.category))
  }
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 GET /api/admin/users/:id
 * stats 从需求/项目/活动数据实时汇总，保证与列表页按用户筛选的结果一致 */
export async function fetchUser(id: string): Promise<User> {
  await delay(300)
  const user = users.find((u) => u.id === id)
  if (!user) throw new Error('用户不存在')

  const enterpriseIds = user.identities
    .filter((i) => i.type === 'community_enterprise')
    .map((i) => i.enterpriseId)
  user.stats = {
    demands: demands.filter((d) => d.publisherId === user.id).length,
    projects: projects.filter((p) =>
      p.undertakers.some(
        (t) =>
          (t.type === 'individual' && t.id === user.id) ||
          (t.type === 'enterprise' && enterpriseIds.includes(t.id)),
      ),
    ).length,
    events: events.filter((e) => e.enrollments.some((en) => en.userId === user.id)).length,
  }
  return user
}

/* TODO: 替换为 PATCH /api/admin/users/:id/status，入参 { status } */
export async function updateUserStatus(id: string, status: User['status']): Promise<{ code: number }> {
  await delay(350)
  const user = users.find((u) => u.id === id)
  if (!user) throw new Error('用户不存在')
  user.status = status
  return { code: 0 }
}

/* TODO: 替换为 GET /api/admin/users/options — 用户下拉候选（后台代提交需求等场景） */
export async function fetchUserOptions(): Promise<{ label: string; value: string }[]> {
  await delay(200)
  return users.map((u) => ({ label: `${u.name}（${u.id}）`, value: u.id }))
}
