import type { PageResult, Project, ProjectInitPayload } from '@/types'
import { httpDelete, httpGet, httpPost, httpPut, httpUpload } from './http'

export interface ProjectQuery {
  page: number
  pageSize: number
  keyword?: string
  /** 状态筛选：支持单值（旧调用）与多值（勾选式筛选）。
   *  多选值中的空串占位表示「不按状态过滤」（保证该字段在 URL 中可往返），落库请求会被服务端忽略 */
  status?: string | string[]
  /** 按参与人筛选：本人承接或其社区企业身份所在企业承接（用户详情数据概览跳转） */
  participant?: string
  /** 按承接企业筛选（企业详情数据概览跳转；值为社区企业 ID 或合作企业 ID） */
  enterprise?: string
  /** 排序字段：initiatedAt（立项日期，默认倒序=最新立项在前） */
  sortBy?: 'initiatedAt' | 'id'
  sortOrder?: 'ascend' | 'descend'
}

/* GET /api/admin/projects?page&pageSize&keyword&status&participant&enterprise&sortBy&sortOrder */
export async function fetchProjects(query: ProjectQuery): Promise<PageResult<Project>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (Array.isArray(query.status)) query.status.forEach((s) => qs.append('status', s))
  else if (query.status) qs.set('status', query.status)
  if (query.participant) qs.set('participant', query.participant)
  if (query.enterprise) qs.set('enterprise', query.enterprise)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<Project>>(`/projects?${qs}`)
}

/* GET /api/admin/projects/:id */
export async function fetchProject(id: string): Promise<Project> {
  return httpGet<Project>(`/projects/${id}`)
}

/* PUT /api/admin/projects/:id — 编辑项目（不改状态/编号/已有里程碑完成态） */
export async function updateProject(id: string, payload: ProjectInitPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/projects/${id}`, payload)
}

/* 项目状态流转（冻结）：进行中 ↔ 已暂停；进行中/已暂停 → 已关闭；已关闭可重新新增（复制）
 * POST /api/admin/projects/:id/pause */
export async function pauseProject(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/projects/${id}/pause`)
}

/* POST /api/admin/projects/:id/resume */
export async function resumeProject(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/projects/${id}/resume`)
}

/* POST /api/admin/projects/:id/close，入参 { reason }（必填） */
export async function closeProject(id: string, reason: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/projects/${id}/close`, { reason })
}

/* POST /api/admin/projects/:id/archive — 归档已结项项目（可在归档管理中恢复） */
export async function archiveProject(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/projects/${id}/archive`)
}

/* POST /api/admin/projects/:id/milestones/:milestoneId/accept — 「进度节点」通过验收
 * （待验收 → 已验收；全部通过自动结项并按承接占比发放经验值） */
export async function acceptProjectMilestone(id: string, milestoneId: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/projects/${id}/milestones/${milestoneId}/accept`)
}

/* POST /api/admin/projects/:id/milestones/:milestoneId/return — 「进度节点」驳回（原因必填）
 * （待验收 → 已退回，承接方可重新提交） */
export async function returnProjectMilestone(id: string, milestoneId: string, reason: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/projects/${id}/milestones/${milestoneId}/return`, { reason })
}

/* POST /api/admin/projects — 直接新增项目（无来源需求）
 * 承接方可多个，占比整数百分比合计 100；里程碑可多选负责承接方
 */
export async function createProject(payload: ProjectInitPayload): Promise<Project> {
  return httpPost<Project>('/projects', payload)
}

/* ---------- 项目合同附件（线下签约合同，图片/PDF 扫描件，复用素材库存储） ---------- */

export interface ProjectContract {
  id: string
  url: string
  fileName: string
  mime: string
  size: number
  sourceType?: string
  sourceId?: string
  createdAt: string
}

/* GET /api/admin/projects/:id/contracts — 该项目的合同附件（最新在前） */
export async function fetchProjectContracts(id: string): Promise<ProjectContract[]> {
  return httpGet<ProjectContract[]>(`/projects/${id}/contracts`)
}

/* POST /api/admin/projects/:id/contracts — 上传合同附件（图片/PDF）；
 * 单文件大小上限取系统配置 uploadMaxSizeMb */
export async function uploadProjectContract(id: string, file: File): Promise<ProjectContract> {
  const form = new FormData()
  form.append('file', file)
  return httpUpload<ProjectContract>(`/projects/${id}/contracts`, form)
}

/* DELETE /api/admin/projects/:id/contracts/:assetId — 删除合同附件（仅限该项目名下附件） */
export async function deleteProjectContract(id: string, assetId: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/projects/${id}/contracts/${assetId}`)
}
