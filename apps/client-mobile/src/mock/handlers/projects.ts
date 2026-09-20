import type { MyProject } from '@/types'
import { accountByUid, grantEnterpriseExperience, grantExperience, nowStamp, projectsByUid, pushNotice } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 项目协作 handlers：列表/详情 + 里程碑提交与验收 + 全量验收自动结项。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

interface ProjectEntry {
  uid: string
  project: MyProject
}

/** 同一项目在双方列表中各有一条记录（同 id），操作需同步全部副本。 */
function recordsOf(projectId: string): ProjectEntry[] {
  const result: ProjectEntry[] = []
  for (const [uid, list] of Object.entries(projectsByUid)) {
    for (const project of list) {
      if (project.id === projectId) result.push({ uid, project })
    }
  }
  return result
}

function milestoneStatus(item: MyProject['milestones'][number]): 'todo' | 'submitted' | 'accepted' {
  return item.status ?? (item.done ? 'accepted' : 'todo')
}

function refreshProgress(entries: ProjectEntry[]): boolean {
  const total = entries[0]?.project.milestones.length ?? 0
  const accepted = entries[0]?.project.milestones.filter((item) => milestoneStatus(item) === 'accepted').length ?? 0
  const progress = total > 0 ? Math.round((accepted / total) * 100) : 0
  const finished = total > 0 && accepted === total
  for (const { project } of entries) {
    project.progress = progress
    if (finished && !project.finishedAt) project.finishedAt = nowStamp()
  }
  return finished
}

function syncMilestone(entries: ProjectEntry[], milestoneId: string, patch: Partial<MyProject['milestones'][number]>): void {
  for (const { project } of entries) {
    const item = project.milestones.find((candidate) => candidate.id === milestoneId)
    if (item) Object.assign(item, patch)
  }
}

/** 结项经验按 wiki-backend §8.6：承接方为社区企业记企业经验，社区个体记个人经验，其余不发放。 */
function grantCompletionExperience(entries: ProjectEntry[]): void {
  const undertaking = entries.find((entry) => entry.project.role !== '需求发起方')
  if (!undertaking) return
  const { uid, project } = undertaking
  if (project.enterpriseId) {
    grantEnterpriseExperience(project.enterpriseId, 100, `项目结项：${project.name}`)
    return
  }
  const hasCommunityIndividual = accountByUid(uid)?.identities.some((item) => item.type === 'community_individual')
  if (hasCommunityIndividual) grantExperience(uid, 100, `项目结项：${project.name}`)
}

export async function fetchMyProjects(): Promise<MyProject[]> {
  return withLatency(() => {
    const payload = readPayload()
    if (!payload) return []
    return [...(projectsByUid[payload.sub] ?? [])]
  }, 180)
}

export async function fetchMyProject(id: string): Promise<MyProject> {
  return withLatency(() => {
    const uid = requireUid()
    const project = (projectsByUid[uid] ?? []).find((item) => item.id === id)
    if (!project) fail(404, '项目不存在或与你无关')
    return structuredClone(project)
  }, 180)
}

/** 承接方提交里程碑完成（可附说明与证据附件）；待发起方验收。 */
export async function submitMilestone(projectId: string, milestoneId: string, note = '', attachments: { name: string; url: string }[] = []): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const mine = (projectsByUid[uid] ?? []).find((item) => item.id === projectId)
    if (!mine) fail(404, '项目不存在或与你无关')
    if (mine.role === '需求发起方') fail(403, '需求发起方不可提交本侧里程碑')
    const entries = recordsOf(projectId)
    const milestone = entries[0]?.project.milestones.find((item) => item.id === milestoneId)
    if (!milestone) fail(404, '里程碑不存在')
    if (milestoneStatus(milestone) !== 'todo') fail(409, '该里程碑已提交或已验收')
    syncMilestone(entries, milestoneId, {
      status: 'submitted',
      submittedAt: nowStamp(),
      submitNote: note.trim() || undefined,
      attachments: attachments.length ? attachments.slice(0, 3) : undefined,
      returnReason: undefined,
    })
    const initiator = entries.find((entry) => entry.project.role === '需求发起方')
    if (initiator) pushNotice(initiator.uid, { type: 'system', title: '里程碑待验收', content: `「${mine.name}」的里程碑「${milestone.title}」已提交，请及时验收。`, link: `/me/projects/${projectId}` })
  })
}

/** v38：发起方退回里程碑（说明原因，退回后承接方可重新提交）。 */
export async function returnMilestone(projectId: string, milestoneId: string, reason: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const mine = (projectsByUid[uid] ?? []).find((item) => item.id === projectId)
    if (!mine) fail(404, '项目不存在或与你无关')
    if (mine.role !== '需求发起方') fail(403, '仅需求发起方可退回里程碑')
    if (!reason.trim()) fail(400, '请填写退回原因')
    const entries = recordsOf(projectId)
    const milestone = entries[0]?.project.milestones.find((item) => item.id === milestoneId)
    if (!milestone) fail(404, '里程碑不存在')
    if (milestoneStatus(milestone) !== 'submitted') fail(409, '仅待验收的里程碑可退回')
    syncMilestone(entries, milestoneId, {
      status: 'todo',
      submittedAt: undefined,
      submitNote: undefined,
      attachments: undefined,
      returnReason: reason.trim(),
    })
    const undertaking = entries.find((entry) => entry.project.role !== '需求发起方')
    if (undertaking) pushNotice(undertaking.uid, { type: 'system', title: '里程碑被退回', content: `「${mine.name}」的里程碑「${milestone.title}」被退回：${reason.trim()}`, link: `/me/projects/${projectId}` })
  })
}

/** 发起方验收里程碑；全部验收通过即结项并发放经验。 */
export async function acceptMilestone(projectId: string, milestoneId: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const mine = (projectsByUid[uid] ?? []).find((item) => item.id === projectId)
    if (!mine) fail(404, '项目不存在或与你无关')
    if (mine.role !== '需求发起方') fail(403, '仅需求发起方可验收里程碑')
    const entries = recordsOf(projectId)
    const milestone = entries[0]?.project.milestones.find((item) => item.id === milestoneId)
    if (!milestone) fail(404, '里程碑不存在')
    if (milestoneStatus(milestone) === 'todo') fail(409, '该里程碑尚未提交')
    if (milestoneStatus(milestone) === 'accepted') fail(409, '该里程碑已验收')
    syncMilestone(entries, milestoneId, { status: 'accepted', acceptedAt: nowStamp(), done: true })
    const finished = refreshProgress(entries)
    const undertaking = entries.find((entry) => entry.project.role !== '需求发起方')
    if (undertaking) pushNotice(undertaking.uid, { type: 'system', title: finished ? '项目已结项' : '里程碑已验收', content: finished ? `「${mine.name}」全部里程碑已验收，项目结项。` : `「${mine.name}」的里程碑「${milestone.title}」已通过验收。`, link: `/me/projects/${projectId}` })
    if (finished) {
      grantCompletionExperience(entries)
      pushNotice(uid, { type: 'system', title: '项目已结项', content: `「${mine.name}」全部里程碑已验收，项目结项。`, link: `/me/projects/${projectId}` })
    }
  })
}
