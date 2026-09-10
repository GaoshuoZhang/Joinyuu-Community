import type { Application, Enterprise, PageResult } from '@/types'
import { applications, users, enterprises } from '@/mock'
import { delay } from './utils'
import { recordAudit } from './auditLogs'

export interface ApplicationQuery {
  page: number
  pageSize: number
  type?: string
  status?: string
}

/* TODO: 替换为 GET /api/admin/applications?page&pageSize&type&status
 * 口径：仅返回入驻申请与身份绑定；空间预约申请随公共空间模块、
 * 展示页发布申请随资讯内容模块迁移至各自审批入口 */
export async function fetchApplications(query: ApplicationQuery): Promise<PageResult<Application>> {
  await delay(400)
  let list = applications.filter((a) => a.type === 'settle' || a.type === 'identity')
  if (query.type) list = list.filter((a) => a.type === query.type)
  if (query.status) list = list.filter((a) => a.status === query.status)
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 POST /api/admin/applications/:id/approve，入参 { comment } */
/* 审批通过 → 按申请类型授予申请人对应身份（口径：所有注册用户均为个人用户，
 * 个人入驻 → 社区个体；企业入驻 → 社区企业；外部企业合作 → 外部企业；一人可多身份） */
function grantIdentity(app: Application) {
  const user = users.find((u) => u.phone === app.applicantPhone)
  if (!user) return /* 未注册申请者（无用户档案）不授予 */
  if (app.type === 'settle') {
    /* 企业入驻：确保企业实体存在（不存在则创建），授予社区企业身份 */
    var ent: Enterprise | undefined = enterprises.find((e) => e.name === app.targetName)
    if (!ent) {
      const maxNum = enterprises.reduce((m, e) => Math.max(m, Number(e.id.replace('E', ''))), 0)
      const newEnt: Enterprise = {
        id: `E${maxNum + 1}`,
        name: app.targetName,
        industry: '综合',
        stage: '初创',
        size: '1-50 人',
        foundedAt: formatNow(),
        settledAt: formatNow(),
        leaseType: '工位',
        status: 'active',
        showcaseStatus: 'none',
        contactName: user.nickname,
        contactPhone: app.applicantPhone,
        contactEmail: user.email,
        description: '审批通过自动创建的入驻企业',
        tags: [],
      }
      enterprises.push(newEnt)
      ent = newEnt
    } else if (ent.status !== 'active') {
      /* 企业已存在（如处于入驻审核中）：审批通过即正式入驻，联动企业状态与入驻时间 */
      ent.status = 'active'
      ent.settledAt = ent.settledAt ?? formatToday()
    }
    const dup = user.identities.some(
      (i) => i.type === 'community_enterprise' && i.enterpriseId === ent!.id,
    )
    if (!dup) {
      user.identities.push({
        type: 'community_enterprise',
        enterpriseId: ent!.id,
        enterpriseName: ent!.name,
        role: 'member',
        title: '入驻企业成员',
        level: 1,
        experience: 0,
      })
    }
  } else if (app.type === 'identity') {
    /* 外部企业合作：授予外部企业身份（targetName = 企业名 · 头衔） */
    var sep = app.targetName.indexOf(' · ')
    var entName = sep > 0 ? app.targetName.slice(0, sep) : app.targetName
    var title = sep > 0 ? app.targetName.slice(sep + 3) : '合作方'
    var dup2 = user.identities.some(
      (i) => i.type === 'external_enterprise' && i.enterpriseName === entName,
    )
    if (!dup2) {
      user.identities.push({
        type: 'external_enterprise',
        enterpriseName: entName,
        title,
      })
    }
  }
}

export async function approveApplication(id: string, comment: string): Promise<{ code: number }> {
  await delay(400)
  const app = applications.find((a) => a.id === id)
  if (!app) throw new Error('申请不存在')
  app.status = 'approved'
  app.records.push({
    step: '运营审批',
    operator: '社区管理员',
    action: 'approve',
    comment: comment || '同意',
    at: formatNow(),
  })
  grantIdentity(app)
  recordAudit('审批中心', '审批通过', `${app.id} · ${app.targetName}`, app.type === 'settle' ? '入驻申请' : '身份绑定')
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/applications/:id/reject，入参 { comment } */
export async function rejectApplication(id: string, comment: string): Promise<{ code: number }> {
  await delay(400)
  const app = applications.find((a) => a.id === id)
  if (!app) throw new Error('申请不存在')
  app.status = 'rejected'
  app.records.push({
    step: '运营审批',
    operator: '社区管理员',
    action: 'reject',
    comment: comment || '不同意',
    at: formatNow(),
  })
  recordAudit('审批中心', '审批驳回', `${app.id} · ${app.targetName}`, comment || undefined)
  return { code: 0 }
}

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function formatToday(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
