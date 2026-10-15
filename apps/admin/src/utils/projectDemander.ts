import type { Project, ProjectInitPayload } from '../types'

export function projectDemanderValue(project: Pick<Project, 'demanderId' | 'demanderName'>): string {
  const id = project.demanderId ?? ''
  return id ? `${id.startsWith('U') ? 'user' : 'enterprise'}:${id}` : (project.demanderName ?? '')
}

/** 选项尚未加载或历史主体已停用时，保留项目已有的需求方身份快照。 */
export function existingProjectDemander(value: string, project: Project | null): Pick<ProjectInitPayload, 'demanderId' | 'demanderName' | 'demanderIdentity'> | null {
  if (!project?.demanderId || value !== projectDemanderValue(project)) return null
  const id = project.demanderId
  const type = id.startsWith('XE') ? 'external_enterprise' : id.startsWith('E') ? 'community_enterprise' : 'individual'
  return {
    demanderId: id,
    demanderName: project.demanderName ?? '',
    demanderIdentity: { ...project.demanderIdentity, type: project.demanderIdentity?.type || type },
  }
}
