import type { PageResult, Project, ProjectInitPayload } from '@/types'
import { httpGet, httpPost, httpPut } from './http'

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

/* 已接入 M1 真实接口：GET /api/admin/projects?page&pageSize&keyword&status&participant&enterprise&sortBy&sortOrder */
export async function fetchProjects(query: ProjectQuery): Promise<PageResult<Project>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.status) qs.set('status', query.status)
  if (query.participant) qs.set('participant', query.participant)
  if (query.enterprise) qs.set('enterprise', query.enterprise)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<Project>>(`/projects?${qs}`)
}

/* 已接入 M1 真实接口：GET /api/admin/projects/:id */
export async function fetchProject(id: string): Promise<Project> {
  return httpGet<Project>(`/projects/${id}`)
}

/* 已接入 M1 真实接口：PUT /api/admin/projects/:id — 编辑项目（不改状态/编号/已有里程碑完成态） */
export async function updateProject(id: string, payload: ProjectInitPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/projects/${id}`, payload)
}

/* 项目状态流转（冻结，2026-09-09）：进行中 ↔ 已暂停；进行中/已暂停 → 已关闭；已关闭可重新创建（复制）
 * 已接入 M1 真实接口：POST /api/admin/projects/:id/pause */
export async function pauseProject(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/projects/${id}/pause`)
}

/* 已接入 M1 真实接口：POST /api/admin/projects/:id/resume */
export async function resumeProject(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/projects/${id}/resume`)
}

/* 已接入 M1 真实接口：POST /api/admin/projects/:id/close，入参 { reason }（必填） */
export async function closeProject(id: string, reason: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/projects/${id}/close`, { reason })
}

/* 已接入 M1 真实接口：POST /api/admin/projects — 直接创建项目（无来源需求）
 * 承接方可多个，占比整数百分比合计 100；里程碑可多选负责承接方
 */
export async function createProject(payload: ProjectInitPayload): Promise<Project> {
  return httpPost<Project>('/projects', payload)
}
