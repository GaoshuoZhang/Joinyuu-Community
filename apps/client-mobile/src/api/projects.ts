import { apiMode, httpDownload, httpGet, httpPost } from './http'
import type { MyProject } from '@/types'
import * as mock from '@/mock/handlers/projects'

/** GET /api/app/me/projects — 我承接的项目（需求发起方 / 本人或企业承接；进度与里程碑只读） */
export async function fetchMyProjects(): Promise<MyProject[]> {
  if (apiMode === 'mock') return mock.fetchMyProjects()
  return httpGet<MyProject[]>('/me/projects')
}

/** GET /api/app/me/projects/:id — 项目详情（参与双方可看） */
export async function fetchMyProject(id: string): Promise<MyProject> {
  if (apiMode === 'mock') return mock.fetchMyProject(id)
  const project = await httpGet<MyProject>(`/me/projects/${id}`)
  await Promise.all(
    project.milestones.flatMap((milestone) =>
      (milestone.attachments ?? []).map(async (attachment) => {
        const blob = await httpDownload(attachment.url)
        attachment.url = URL.createObjectURL(blob)
      }),
    ),
  )
  return project
}

/** 承接方提交里程碑完成（待发起方验收；可附证据图片）。 */
export async function submitMilestone(
  projectId: string,
  milestoneId: string,
  note?: string,
  attachments?: { name: string; url: string }[],
): Promise<void> {
  if (apiMode === 'mock') return mock.submitMilestone(projectId, milestoneId, note, attachments)
  await httpPost(`/me/projects/${projectId}/milestones/${milestoneId}/submit`, {
    note,
    attachments: attachments?.map((item) => item.url.split('/').pop() || item.url),
  })
}

/** 发起方退回里程碑（承接方可重新提交）。 */
export async function returnMilestone(projectId: string, milestoneId: string, reason: string): Promise<void> {
  if (apiMode === 'mock') return mock.returnMilestone(projectId, milestoneId, reason)
  await httpPost(`/me/projects/${projectId}/milestones/${milestoneId}/return`, { reason })
}

/** 发起方验收里程碑；全部验收通过即结项并发放经验。 */
export async function acceptMilestone(projectId: string, milestoneId: string): Promise<void> {
  if (apiMode === 'mock') return mock.acceptMilestone(projectId, milestoneId)
  await httpPost(`/me/projects/${projectId}/milestones/${milestoneId}/accept`)
}
