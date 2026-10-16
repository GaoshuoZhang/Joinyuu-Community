import { identityTypeMap } from '@/constants/identity'
import type { IdentityType } from '@/types'

/* 后台主体展示口径统一工具（全站唯一来源，禁止各页面自行拼接）：
 * - 用户类主体（个人用户 / 社区个体 / 社区官方）：`真实姓名（身份 · 昵称 · 用户ID）`
 *   真实姓名为空时首位回落昵称，如「四月（社区个体 · 四月 · U1016）」；
 * - 企业类主体（社区企业 / 合作企业）：`企业名（身份 · 企业ID）`；
 * - 自定义主体（未注册代录）：`名称（自定义）`。
 * 用于承接方下拉、响应人列、成员/联系人选项等，避免同名或同昵称用户相互混淆。 */

export interface UserSubjectInput {
  /** 真实姓名（可空，空时首位回落昵称） */
  realName?: string | null
  /** 昵称 */
  nickname?: string | null
  /** 用户 ID（如 U1016） */
  uid?: string | null
  /** 身份标签（如「社区个体」「个人用户」）；未知时省略该段 */
  identity?: string | null
}

export interface EnterpriseSubjectInput {
  /** 企业名 */
  name?: string | null
  /** 身份标签（如「社区企业」「合作企业」）；未知时省略该段 */
  identity?: string | null
  /** 企业 ID（社区企业 E* / 合作企业 XE*） */
  enterpriseId?: string | null
}

/** 用户类主体展示名：`真实姓名（身份 · 昵称 · 用户ID）` */
export function userSubjectLabel(input: UserSubjectInput): string {
  const nickname = (input.nickname ?? '').trim()
  const realName = (input.realName ?? '').trim()
  const primary = realName || nickname
  if (!primary) return '—'
  const parts = [(input.identity ?? '').trim(), nickname, (input.uid ?? '').trim()].filter(Boolean)
  return parts.length ? `${primary}（${parts.join(' · ')}）` : primary
}

/** 企业类主体展示名：`企业名（身份 · 企业ID）` */
export function enterpriseSubjectLabel(input: EnterpriseSubjectInput): string {
  const name = (input.name ?? '').trim()
  if (!name) return '—'
  const parts = [(input.identity ?? '').trim(), (input.enterpriseId ?? '').trim()].filter(Boolean)
  return parts.length ? `${name}（${parts.join(' · ')}）` : name
}

/** 自定义主体（未注册代录）：`名称（自定义）` */
export function customSubjectLabel(name: string | null | undefined): string {
  const value = (name ?? '').trim()
  return value ? `${value}（自定义）` : '—'
}

/** 关联身份摘要（社区个体/社区企业等，以「、」连接）；仅持有基础个人身份时回落「个人用户」 */
export function userIdentitySummary(user: { identities?: Array<{ type: string }> } | null | undefined): string {
  const labels = (user?.identities ?? [])
    .filter((i) => i.type !== 'individual')
    .map((i) => identityTypeMap[i.type as IdentityType] ?? i.type)
  return labels.join('、') || '个人用户'
}

/** 身份快照 → 标签文案；快照缺失或类型未知时返回空串（拼统一口径时据此省略身份段，避免出现「—」） */
export function identityLabelOrEmpty(identity: { type?: string; title?: string | null } | null | undefined): string {
  if (!identity?.type) return ''
  if (identity.type === 'official') return identity.title?.trim() || identityTypeMap.official
  return identityTypeMap[identity.type as IdentityType] ?? ''
}
