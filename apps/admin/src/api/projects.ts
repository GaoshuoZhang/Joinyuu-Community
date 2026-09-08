import type { PageResult, Project } from '@/types'
import type { ProjectInitPayload } from '@/types'
import { enterprises, externalEnterpriseProfiles, projects, users } from '@/mock'
import { delay } from './utils'

export interface ProjectQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
  /** 按参与人筛选：本人承接或其社区企业身份所在企业承接（用户详情数据概览跳转） */
  participant?: string
  /** 按承接企业筛选（企业详情数据概览跳转；值为社区企业 ID 或外部企业 ID） */
  enterprise?: string
  /** 排序字段：initiatedAt（立项日期，默认倒序=最新立项在前） */
  sortBy?: 'initiatedAt' | 'id'
  sortOrder?: 'ascend' | 'descend'
}

/* TODO: 替换为 GET /api/admin/projects?page&pageSize&keyword&status */
export async function fetchProjects(query: ProjectQuery): Promise<PageResult<Project>> {
  await delay(400)
  let list = [...projects]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter((p) => p.name.toLowerCase().includes(kw) || p.code.toLowerCase().includes(kw))
  }
  if (query.status) list = list.filter((p) => p.status === query.status)
  if (query.participant) {
    const participant = users.find((u) => u.uid === query.participant)
    const enterpriseIds =
      participant?.identities.filter((i) => i.type === 'community_enterprise').map((i) => i.enterpriseId) ?? []
    list = list.filter((p) =>
      p.undertakers.some(
        (t) =>
          (t.type === 'individual' && t.id === query.participant) ||
          (t.type === 'enterprise' && enterpriseIds.includes(t.id)),
      ),
    )
  }
  if (query.enterprise) {
    const isCommunity = enterprises.some((e) => e.id === query.enterprise)
    if (isCommunity) {
      /* 社区企业：按承接方企业 ID 匹配 */
      list = list.filter((p) => p.undertakers.some((t) => t.type === 'enterprise' && t.id === query.enterprise))
    } else {
      /* 外部企业：按 ID（XE*）解析档案名，匹配其成员以个人身份承接的项目 */
      const extProfile = externalEnterpriseProfiles.find((p) => p.id === query.enterprise)
      const memberIds = users
        .filter(
          (u) => u.identities.some((i) => i.type === 'external_enterprise' && i.enterpriseName === extProfile?.name),
        )
        .map((u) => u.uid)
      list = list.filter((p) => p.undertakers.some((t) => t.type === 'individual' && memberIds.includes(t.id)))
    }
  }
  /* 排序：默认立项日期倒序（最新立项在前），可按立项日期/编号正倒序 */
  const field = query.sortBy ?? 'initiatedAt'
  const dir = query.sortOrder === 'ascend' ? 1 : -1
  list.sort((a, b) => {
    const av = field === 'id' ? Number(a.id.replace('P', '')) : a.initiatedAt
    const bv = field === 'id' ? Number(b.id.replace('P', '')) : b.initiatedAt
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 GET /api/admin/projects/:id */
export async function fetchProject(id: string): Promise<Project> {
  await delay(300)
  const project = projects.find((p) => p.id === id)
  if (!project) throw new Error('项目不存在')
  return project
}

/* 承接方展示名：企业用企业名；个人用「姓名 · 头衔」（与下拉选项 label 一致） */
function undertakerName(type: 'enterprise' | 'individual', id: string): string {
  if (type === 'enterprise') {
    const enterprise = enterprises.find((e) => e.id === id)
    if (!enterprise) throw new Error('承接企业不存在')
    return enterprise.name
  }
  const user = users.find((u) => u.uid === id)
  if (!user) throw new Error('承接人不存在')
  const identity = user.identities.find((i) => i.type === 'community_individual')
  return `${user.nickname} · ${identity?.title ?? ''}`
}

function formatDate(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/* TODO: 替换为 POST /api/admin/projects/draft — 保存项目草稿（不校验必填，承接占比可为空） */
export async function saveProjectDraft(payload: ProjectInitPayload): Promise<Project> {
  await delay(300)
  const maxNum = projects.reduce((m, p) => Math.max(m, Number(p.id.replace('P', ''))), 0)
  const yearCount = projects.filter((p) => p.code.startsWith('JY-2026')).length + 1
  const undertakers = payload.undertakers.map((u) => {
    let name = u.id
    try {
      name = undertakerName(u.type, u.id)
    } catch {
      /* 草稿允许承接方信息不全 */
    }
    return { ...u, name }
  })
  const project: Project = {
    id: `P${maxNum + 1}`,
    code: `JY-2026-${String(yearCount).padStart(2, '0')}`,
    name: payload.projectName,
    undertakers,
    status: 'recruiting',
    progress: 0,
    startDate: payload.startDate,
    endDate: payload.endDate,
    initiatedAt: formatDate(),
    description: payload.description,
    milestones: payload.milestones
      .filter((m) => m.name.trim())
      .map((m) => ({ name: m.name.trim(), status: 'todo' as const, date: m.date, owners: m.owners })),
    memberCount: undertakers.length,
  }
  projects.push(project)
  return project
}

/* TODO: 替换为 POST /api/admin/projects — 直接创建项目（无来源需求）
 * 承接方可多个，占比整数百分比合计 100；里程碑可多选负责承接方
 */
export async function createProject(payload: ProjectInitPayload): Promise<Project> {
  await delay(500)
  if (payload.undertakers.length === 0) throw new Error('请至少选择一个承接方')

  const undertakers = payload.undertakers.map((u) => ({ ...u, name: undertakerName(u.type, u.id) }))
  const shareSum = undertakers.reduce((s, u) => s + u.share, 0)
  if (shareSum !== 100) throw new Error('承接占比合计须为 100%')

  const maxNum = projects.reduce((m, p) => Math.max(m, Number(p.id.replace('P', ''))), 0)
  const yearCount = projects.filter((p) => p.code.startsWith('JY-2026')).length + 1
  const project: Project = {
    id: `P${maxNum + 1}`,
    code: `JY-2026-${String(yearCount).padStart(2, '0')}`,
    name: payload.projectName,
    undertakers,
    status: 'running',
    progress: 0,
    startDate: payload.startDate,
    endDate: payload.endDate,
    initiatedAt: formatDate(),
    description: payload.description,
    milestones: payload.milestones
      .filter((m) => m.name.trim())
      .map((m) => ({ name: m.name.trim(), status: 'todo' as const, date: m.date, owners: m.owners })),
    memberCount: undertakers.length,
  }
  projects.push(project)
  return project
}
