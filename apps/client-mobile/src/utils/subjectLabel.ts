import type { IdentityType } from '@/types'

/* 客户端用户主体展示口径统一工具：`真实姓名（身份 · 昵称）`
 * —— 按产品决定客户端一律不展示用户 ID（仅「我的」页面展示本人 UID），
 * 用于发布者查看响应人、企业成员等场景，避免同名或同昵称用户相互混淆。
 * 企业类主体保持 `企业名（身份 · 企业ID）`（企业编号本身即可区分同名企业）。 */

/** 身份类型 → 展示文案（与后台口径一致，客户端不自造文案） */
export const identityLabels: Record<string, string> = {
  individual: '个人用户',
  community_individual: '社区个体',
  community_enterprise: '社区企业',
  external_enterprise: '合作企业',
  external_individual: '个人用户',
  external_company: '合作企业',
  official: '社区官方',
}

/** 身份标签文案：社区官方优先展示身份快照里的工作人员角色名 */
export function identityLabelOf(identity: { type?: string; title?: string | null } | null | undefined): string {
  if (!identity?.type) return ''
  if (identity.type === 'official') return identity.title?.trim() || identityLabels.official
  return identityLabels[identity.type as IdentityType] ?? ''
}

export interface ClientSubjectInput {
  /** 真实姓名（可空，空时首位回落昵称） */
  realName?: string | null
  /** 昵称 */
  nickname?: string | null
  /** 身份标签（如「社区个体」「个人用户」）；未知时省略该段 */
  identity?: string | null
  /** 变化/服务端欠缺昵称时的展示名兜底（如响应快照姓名） */
  fallbackName?: string | null
}

/** 用户类主体展示名：`真实姓名（身份 · 昵称）`；账号昵称缺失（如代报名快照）时只保留身份段 */
export function userSubjectLabel(input: ClientSubjectInput): string {
  const realName = (input.realName ?? '').trim()
  const nickname = (input.nickname ?? '').trim()
  const fallback = (input.fallbackName ?? '').trim()
  const primary = realName || nickname || fallback
  if (!primary) return ''
  const parts = [(input.identity ?? '').trim(), nickname].filter(Boolean)
  return parts.length ? `${primary}（${parts.join(' · ')}）` : primary
}
