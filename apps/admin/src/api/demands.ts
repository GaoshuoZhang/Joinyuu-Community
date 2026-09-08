import type { Demand, PageResult, Project, ProjectInitPayload, UserIdentity } from '@/types'
import { demands, enterprises, externalEnterpriseProfiles, users } from '@/mock'
import { delay } from './utils'
import { createProject } from './projects'

export interface DemandQuery {
  page: number
  pageSize: number
  keyword?: string
  category?: string
  status?: string
  /** 按提交人筛选（用户详情数据概览跳转） */
  publisherId?: string
  /** 按发布企业筛选（企业详情数据概览跳转；值为社区企业 ID 或外部企业 ID） */
  enterprise?: string
  /** 排序字段：createdAt（默认，倒序=最新在前）| publishedAt（发布时间） */
  sortBy?: 'createdAt' | 'id' | 'publishedAt'
  sortOrder?: 'ascend' | 'descend'
}

/* 定时发布模拟：到点自动转为已发布，并写入发布时间（真实系统为服务端定时任务） */
function simulateScheduledPublish() {
  const now = formatNow()
  for (const d of demands) {
    if (d.status === 'scheduled' && d.scheduledAt && d.scheduledAt <= now) {
      d.status = 'published'
      d.publishedAt = d.publishedAt ?? now
      d.scheduledAt = undefined
    }
  }
}

/* TODO: 替换为 GET /api/admin/demands?page&pageSize&keyword&category&status */
export async function fetchDemands(query: DemandQuery): Promise<PageResult<Demand>> {
  await delay(400)
  simulateScheduledPublish()
  let list = [...demands]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter((d) => d.title.toLowerCase().includes(kw) || d.id.toLowerCase().includes(kw))
  }
  if (query.category) list = list.filter((d) => d.category === query.category)
  if (query.status) list = list.filter((d) => d.status === query.status)
  if (query.publisherId) list = list.filter((d) => d.publisherId === query.publisherId)
  if (query.enterprise) {
    /* 社区企业按 enterpriseId 匹配；外部企业按 ID（XE*）解析档案名后匹配 enterpriseName */
    const isCommunity = enterprises.some((e) => e.id === query.enterprise)
    if (isCommunity) {
      list = list.filter((d) => d.publisherIdentity?.enterpriseId === query.enterprise)
    } else {
      const extProfile = externalEnterpriseProfiles.find((p) => p.id === query.enterprise)
      list = list.filter((d) => d.publisherIdentity?.enterpriseName === extProfile?.name)
    }
  }
  /* 排序：默认创建时间倒序（最新在前），可按创建时间/发布时间/编号正倒序（publishedAt 空值排最后） */
  const field = query.sortBy ?? 'createdAt'
  const dir = query.sortOrder === 'ascend' ? 1 : -1
  list.sort((a, b) => {
    if (field === 'id') {
      const av = Number(a.id.replace('D', ''))
      const bv = Number(b.id.replace('D', ''))
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
    }
    const av = field === 'publishedAt' ? a.publishedAt ?? '' : a.createdAt
    const bv = field === 'publishedAt' ? b.publishedAt ?? '' : b.createdAt
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 GET /api/admin/demands/:id */
export async function fetchDemand(id: string): Promise<Demand> {
  await delay(300)
  simulateScheduledPublish()
  const demand = demands.find((d) => d.id === id)
  if (!demand) throw new Error('需求不存在')
  return demand
}

export interface DemandPublishPayload {
  title: string
  category: string
  budget: string
  period: string
  description: string
  visibilityIdentities: string[]
  visibilityLevels: string[]
  /** 可报名范围：默认与可见范围一致，可单独调整 */
  enrollmentIdentities: string[]
  enrollmentLevels: string[]
  deadline: string
  /** 提交人联系电话（必填） */
  contactPhone: string
  /** 提交人联系邮箱（选填） */
  contactEmail?: string
}

function applyPayload(demand: Demand, payload: DemandPublishPayload) {
  demand.title = payload.title
  demand.category = payload.category
  demand.budget = payload.budget
  demand.period = payload.period
  demand.description = payload.description
  demand.visibilityIdentities = payload.visibilityIdentities as Demand['visibilityIdentities']
  demand.visibilityLevels = payload.visibilityLevels
  demand.enrollmentIdentities = payload.enrollmentIdentities as Demand['enrollmentIdentities']
  demand.enrollmentLevels = payload.enrollmentLevels
  demand.deadline = payload.deadline
  demand.contactPhone = payload.contactPhone
  demand.contactEmail = payload.contactEmail || undefined
}

/* TODO: 替换为 POST /api/admin/demands/:id/approve — 待审核需求仅读审核通过，转为待发布 */
export async function approveDemand(id: string): Promise<{ code: number }> {
  await delay(400)
  const demand = demands.find((d) => d.id === id)
  if (!demand) throw new Error('需求不存在')
  if (demand.status !== 'pending') throw new Error('仅待审核的需求可审核')
  demand.status = 'pending_release'
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/demands/:id/publish-now — 待发布需求立即发布 */
export async function publishDemandNow(id: string): Promise<{ code: number }> {
  await delay(350)
  const demand = demands.find((d) => d.id === id)
  if (!demand) throw new Error('需求不存在')
  if (demand.status !== 'pending_release') throw new Error('仅待发布的需求可立即发布')
  demand.status = 'published'
  demand.scheduledAt = undefined
  demand.publishedAt = formatNow()
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/demands/:id/retract — 撤回发布：已发布 → 待发布 */
export async function retractDemand(id: string): Promise<{ code: number }> {
  await delay(350)
  const demand = demands.find((d) => d.id === id)
  if (!demand) throw new Error('需求不存在')
  if (demand.status !== 'published') throw new Error('仅已发布的需求可撤回发布')
  demand.status = 'pending_release'
  demand.scheduledAt = undefined
  demand.publishedAt = undefined
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/demands/:id/schedule — 待发布需求设定定时发布时间，转为定时发布中 */
export async function scheduleDemand(id: string, scheduledAt: string): Promise<{ code: number }> {
  await delay(400)
  const demand = demands.find((d) => d.id === id)
  if (!demand) throw new Error('需求不存在')
  if (demand.status !== 'pending_release') throw new Error('仅待发布的需求可设定时发布')
  demand.status = 'scheduled'
  demand.scheduledAt = scheduledAt
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/demands/:id/cancel-schedule — 取消定时发布，转为待发布 */
export async function cancelDemandSchedule(id: string): Promise<{ code: number }> {
  await delay(350)
  const demand = demands.find((d) => d.id === id)
  if (!demand) throw new Error('需求不存在')
  if (demand.status !== 'scheduled') throw new Error('仅定时发布中的需求可取消定时')
  demand.status = 'pending_release'
  demand.scheduledAt = undefined
  demand.publishedAt = undefined
  return { code: 0 }
}

/* TODO: 替换为 PUT /api/admin/demands/:id — 需求再编辑（待发布/已发布，不改状态） */
export async function updateDemand(id: string, payload: DemandPublishPayload): Promise<{ code: number }> {
  await delay(400)
  const demand = demands.find((d) => d.id === id)
  if (!demand) throw new Error('需求不存在')
  applyPayload(demand, payload)
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/demands/:id/reject，入参 { reason }（必填） */
export async function rejectDemand(id: string, reason: string): Promise<{ code: number }> {
  await delay(400)
  const demand = demands.find((d) => d.id === id)
  if (!demand) throw new Error('需求不存在')
  demand.status = 'rejected'
  demand.rejectedReason = reason
  return { code: 0 }
}

/* TODO: 替换为 PATCH /api/admin/demands/:id/status，入参 { status: 'closed' } */
export async function closeDemand(id: string): Promise<{ code: number }> {
  await delay(350)
  const demand = demands.find((d) => d.id === id)
  if (!demand) throw new Error('需求不存在')
  demand.status = 'closed'
  return { code: 0 }
}

/* ---------- 立项 ---------- */

export interface UndertakerOption {
  group: string
  label: string
  value: string
}

/* TODO: 替换为 GET /api/admin/demands/undertaker-options — 立项承接方候选（社区企业 + 社区个人） */
export async function fetchUndertakerOptions(): Promise<UndertakerOption[]> {
  await delay(200)
  return [
    ...enterprises.map((e) => ({ group: '社区企业', label: e.name, value: `enterprise:${e.id}` })),
    ...users
      .filter((u) => u.identities.some((i) => i.type === 'community_individual'))
      .map((u) => {
        const identity = u.identities.find((i) => i.type === 'community_individual')!
        return { group: '社区个人', label: `${u.nickname} · ${identity.title}`, value: `individual:${u.uid}` }
      }),
  ]
}

/* TODO: 替换为 POST /api/admin/demands/:id/initiate-project — 需求立项（可多承接方）
 * 项目创建逻辑复用 POST /api/admin/projects（createProject），此处仅做需求↔项目双向关联 */
export async function initiateProject(demandId: string, payload: ProjectInitPayload): Promise<Project> {
  await delay(100)
  const demand = demands.find((d) => d.id === demandId)
  if (!demand) throw new Error('需求不存在')

  const project = await createProject(payload)
  demand.status = 'projected'
  demand.projectId = project.id
  return project
}

/* ---------- 后台直接创建需求 ---------- */

/* TODO: 替换为 GET /api/admin/publisher-options — 提交人选项（全部个人用户 + 全部企业，含联系方式用于自动填充） */
export async function fetchPublisherOptions(): Promise<{
  users: { uid: string; nickname: string; phone: string; email: string }[]
  enterprises: { id: string; name: string; contactPhone: string; contactEmail?: string }[]
}> {
  await delay(200)
  return {
    users: users.map((u) => ({ uid: u.uid, nickname: u.nickname, phone: u.phone, email: u.email })),
    enterprises: enterprises.map((e) => ({
      id: e.id,
      name: e.name,
      contactPhone: e.contactPhone,
      contactEmail: e.contactEmail,
    })),
  }
}

export interface DemandCreatePayload extends DemandPublishPayload {
  /** 提交人 ID：individual=用户 ID / enterprise=企业 ID / custom=空串 */
  publisherId: string
  /** 自定义提交人名称（publisherType=custom 时使用） */
  publisherName?: string
  /** 提交人类型（决定联系方式自动填充与身份快照来源） */
  publisherType: 'individual' | 'enterprise' | 'custom'
  /** 提交身份快照（仅 individual 时存在） */
  publisherIdentity: UserIdentity | null
  /** 提交人联系电话（必填） */
  contactPhone: string
  /** 提交人联系邮箱（选填） */
  contactEmail?: string
  scheduledAt?: string
}

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* TODO: 替换为 POST /api/admin/demands — 后台直接创建需求（选定提交用户与其提交身份）
 * 设置 scheduledAt 时进入定时发布中状态，到点自动发布；否则立即发布 */
export async function createDemand(payload: DemandCreatePayload): Promise<Demand> {
  await delay(500)
  /* 提交人三类来源：注册个人用户 / 注册企业 / 未注册自建条目 */
  const user =
    payload.publisherType === 'individual' ? users.find((u) => u.uid === payload.publisherId) : undefined
  const enterprise =
    payload.publisherType === 'enterprise' ? enterprises.find((e) => e.id === payload.publisherId) : undefined
  if (payload.publisherType === 'individual' && !user) throw new Error('提交用户不存在')
  if (payload.publisherType === 'enterprise' && !enterprise) throw new Error('提交企业不存在')
  if (payload.publisherType === 'custom' && !payload.publisherName?.trim())
    throw new Error('请输入提交人名称')

  const publisherName =
    payload.publisherType === 'enterprise'
      ? enterprise!.name
      : payload.publisherType === 'individual'
        ? user!.nickname
        : payload.publisherName!.trim()

  const maxNum = demands.reduce((m, d) => Math.max(m, Number(d.id.replace('D', ''))), 0)
  const demand: Demand = {
    id: `D${maxNum + 1}`,
    title: '',
    category: '',
    publisherId: payload.publisherId,
    publisherName,
    publisherIdentity: payload.publisherType === 'individual' ? payload.publisherIdentity : null,
    contactPhone: payload.contactPhone,
    contactEmail: payload.contactEmail || undefined,
    budget: '',
    period: '',
    deadline: '',
    visibilityIdentities: [],
    visibilityLevels: [],
    enrollmentIdentities: [],
    enrollmentLevels: [],
    status: payload.scheduledAt ? 'scheduled' : 'published',
    scheduledAt: payload.scheduledAt,
    publishedAt: payload.scheduledAt ? undefined : formatNow(),
    createdAt: formatNow(),
    description: '',
    tags: [],
    respondents: [],
  }
  applyPayload(demand, payload)
  demands.push(demand)
  return demand
}
