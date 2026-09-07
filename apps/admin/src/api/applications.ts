import type { Application, PageResult } from '@/types'
import { applications } from '@/mock'
import { delay } from './utils'

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
  return { code: 0 }
}

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
