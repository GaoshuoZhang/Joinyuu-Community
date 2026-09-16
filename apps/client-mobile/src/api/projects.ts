import { apiMode, httpGet, httpPost } from './http'
import type { MyProject, ProjectFileItem, ProjectMessage, ProjectTask } from '@/types'
import * as mock from '@/mock/handlers/projects'

/** GET /api/app/me/projects — 我承接的项目（需求发起方 / 本人或企业承接；进度与里程碑只读） */
/** GET /api/app/projects/:id/collab — 协作空间（v42 [MOCK-ONLY]） */
export async function fetchProjectCollab(id: string): Promise<{ tasks: ProjectTask[]; files: ProjectFileItem[]; messages: ProjectMessage[] }> {
  if (apiMode === 'mock') return mock.fetchProjectCollab(id)
  return httpGet(`/projects/${id}/collab`)
}

/** POST /api/app/projects/:id/tasks */
export async function addProjectTask(id: string, title: string): Promise<void> {
  if (apiMode === 'mock') return mock.addProjectTask(id, title)
  await httpPost(`/projects/${id}/tasks`, { title })
}

/** PATCH /api/app/projects/:id/tasks/:taskId */
export async function toggleProjectTask(id: string, taskId: string): Promise<void> {
  if (apiMode === 'mock') return mock.toggleProjectTask(id, taskId)
  await httpPost(`/projects/${id}/tasks/${taskId}/toggle`)
}

/** POST /api/app/projects/:id/files */
export async function addProjectFile(id: string, name: string, url: string): Promise<void> {
  if (apiMode === 'mock') return mock.addProjectFile(id, name, url)
  await httpPost(`/projects/${id}/files`, { name, url })
}

/** POST /api/app/projects/:id/messages */
export async function sendProjectMessage(id: string, content: string): Promise<void> {
  if (apiMode === 'mock') return mock.sendProjectMessage(id, content)
  await httpPost(`/projects/${id}/messages`, { content })
}

/** GET /api/app/projects/:id/collab — 协作空间（v42 [MOCK-ONLY]） */

/** POST /api/app/projects/:id/tasks */

/** PATCH /api/app/projects/:id/tasks/:taskId */

/** POST /api/app/projects/:id/files */

/** POST /api/app/projects/:id/messages */

export async function fetchMyProjects(): Promise<MyProject[]> {
  if (apiMode === 'mock') return mock.fetchMyProjects()
  return httpGet<MyProject[]>('/me/projects')
}

/** GET /api/app/me/projects/:id — 项目详情（参与双方可看） */
export async function fetchMyProject(id: string): Promise<MyProject> {
  if (apiMode === 'mock') return mock.fetchMyProject(id)
  return httpGet<MyProject>(`/me/projects/${id}`)
}

/** [MOCK-ONLY] 承接方提交里程碑完成（待发起方验收；可附证据图片）。 */
export async function submitMilestone(
  projectId: string,
  milestoneId: string,
  note?: string,
  attachments?: { name: string; url: string }[],
): Promise<void> {
  if (apiMode === 'mock') return mock.submitMilestone(projectId, milestoneId, note, attachments)
  await httpPost(`/me/projects/${projectId}/milestones/${milestoneId}/submit`, { note, attachments })
}

/** [MOCK-ONLY] 发起方退回里程碑（承接方可重新提交）。 */
export async function returnMilestone(projectId: string, milestoneId: string, reason: string): Promise<void> {
  if (apiMode === 'mock') return mock.returnMilestone(projectId, milestoneId, reason)
  await httpPost(`/me/projects/${projectId}/milestones/${milestoneId}/return`, { reason })
}

/** [MOCK-ONLY] 发起方验收里程碑；全部验收通过即结项并发放经验。 */
export async function acceptMilestone(projectId: string, milestoneId: string): Promise<void> {
  if (apiMode === 'mock') return mock.acceptMilestone(projectId, milestoneId)
  await httpPost(`/me/projects/${projectId}/milestones/${milestoneId}/accept`)
}
