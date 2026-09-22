import { httpDownload, httpGet, httpPost } from './http'
import type { MyProject } from '@/types'

/** GET /api/app/me/projects — 我承接的项目（需求发起方 / 本人或企业承接；进度与里程碑只读） */
export async function fetchMyProjects(): Promise<MyProject[]> {
  return httpGet<MyProject[]>('/me/projects')
}

/** 里程碑证据附件的 blob URL 登记：由视图在离开页面时统一回收，避免反复进出详情页累积内存 */
const attachmentObjectUrls = new Set<string>()

/** 回收本项目详情创建的附件 blob URL（视图 onBeforeUnmount 调用） */
export function revokeProjectAttachmentUrls(): void {
  for (const url of attachmentObjectUrls) URL.revokeObjectURL(url)
  attachmentObjectUrls.clear()
}

/** GET /api/app/me/projects/:id — 项目详情（参与双方可看） */
export async function fetchMyProject(id: string): Promise<MyProject> {
  const project = await httpGet<MyProject>(`/me/projects/${id}`)
  /* 附件逐个下载并降级：单个附件失败（403/断网）不再让整页进入错误态，失败项保留服务端地址 */
  await Promise.allSettled(
    project.milestones.flatMap((milestone) =>
      (milestone.attachments ?? []).map(async (attachment) => {
        const blob = await httpDownload(attachment.url)
        const objectUrl = URL.createObjectURL(blob)
        attachmentObjectUrls.add(objectUrl)
        attachment.url = objectUrl
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
  await httpPost(`/me/projects/${projectId}/milestones/${milestoneId}/submit`, {
    note,
    attachments: attachments?.map((item) => item.url.split('/').pop() || item.url),
  })
}

/** 发起方退回里程碑（承接方可重新提交）。 */
export async function returnMilestone(projectId: string, milestoneId: string, reason: string): Promise<void> {
  await httpPost(`/me/projects/${projectId}/milestones/${milestoneId}/return`, { reason })
}

/** 发起方验收里程碑；全部验收通过即结项并发放经验。 */
export async function acceptMilestone(projectId: string, milestoneId: string): Promise<void> {
  await httpPost(`/me/projects/${projectId}/milestones/${milestoneId}/accept`)
}
