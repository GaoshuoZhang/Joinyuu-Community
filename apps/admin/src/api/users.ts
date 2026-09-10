import type { PageResult, User } from '@/types'
import { demands, events, projects, users } from '@/mock'
import { delay } from './utils'
import { recordAudit } from './auditLogs'

export interface UserQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
  /** 身份筛选：individual=个人用户（仅持有基础个人身份）| community_individual | community_enterprise | external_enterprise */
  category?: string
  /** 实名状态筛选：verified=已实名（真实姓名+身份证号齐全）| unverified=未实名 */
  realStatus?: string
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
      (u) => u.nickname.toLowerCase().includes(kw) || u.uid.toLowerCase().includes(kw) || u.phone.includes(kw),
    )
  }
  if (query.status) list = list.filter((u) => u.status === query.status)
  /* 实名状态派生规则：真实姓名与身份证号均填写 = 已实名 */
  if (query.realStatus === 'verified') list = list.filter((u) => !!u.realName && !!u.citizenId)
  if (query.realStatus === 'unverified') list = list.filter((u) => !u.realName || !u.citizenId)
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
  const user = users.find((u) => u.uid === id)
  if (!user) throw new Error('用户不存在')

  const enterpriseIds = user.identities
    .filter((i) => i.type === 'community_enterprise')
    .map((i) => i.enterpriseId)
  const stats = {
    demands: demands.filter((d) => d.publisherId === user.uid).length,
    projects: projects.filter((p) =>
      p.undertakers.some(
        (t) =>
          (t.type === 'individual' && t.id === user.uid) ||
          (t.type === 'enterprise' && enterpriseIds.includes(t.id)),
      ),
    ).length,
    events: events.filter((e) => e.enrollments.some((en) => en.userId === user.uid)).length,
  }
  /* 返回快照副本：修复详情页 load 后因引用不变导致数据不刷新的问题（M1 为真实 HTTP 序列化新对象） */
  return { ...user, stats, identities: user.identities.map((i) => ({ ...i })) }
}

/* TODO: 替换为 PATCH /api/admin/users/:id/status，入参 { status } */
export async function updateUserStatus(id: string, status: User['status']): Promise<{ code: number }> {
  await delay(350)
  const user = users.find((u) => u.uid === id)
  if (!user) throw new Error('用户不存在')
  user.status = status
  /* 解冻时清理冻结信息 */
  if (status === 'active') {
    user.frozenUntil = undefined
    user.frozenReason = undefined
  }
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/users/:id/freeze，入参 { frozenUntil?, reason }
 * 冻结账号：permanent=true 长期冻结（不写 frozenUntil），否则需冻结期限（日期+时间）；reason 必填 */
export interface UserFreezePayload {
  /** 冻结期限（日期+时间；permanent=true 时忽略） */
  until?: string
  /** 长期冻结 */
  permanent: boolean
  /** 冻结原因（必填） */
  reason: string
}

export async function freezeUser(id: string, payload: UserFreezePayload): Promise<{ code: number }> {
  await delay(350)
  const user = users.find((u) => u.uid === id)
  if (!user) throw new Error('用户不存在')
  if (user.status === 'frozen') throw new Error('该账号已处于冻结状态')
  if (!payload.permanent && !payload.until) throw new Error('请选择冻结期限或开启长期冻结')
  if (!payload.reason.trim()) throw new Error('请填写冻结原因')
  user.status = 'frozen'
  user.frozenUntil = payload.permanent ? undefined : payload.until
  user.frozenReason = payload.reason.trim()
  recordAudit('社区成员', '冻结账号', `${user.uid} · ${user.nickname}`, payload.reason.trim())
  return { code: 0 }
}

/* TODO: 替换为 GET /api/admin/users/options — 用户下拉候选（后台代提交需求等场景） */
export async function fetchUserOptions(): Promise<{ label: string; value: string }[]> {
  await delay(200)
  return users.map((u) => ({ label: `${u.nickname}（${u.uid}）`, value: u.uid }))
}
