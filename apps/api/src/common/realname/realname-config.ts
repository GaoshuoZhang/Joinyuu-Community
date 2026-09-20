import type { SystemConfig } from '@prisma/client'
import {
  asStringRecord,
  normalizeCredentialMode,
  resolveCredential,
  type CredentialMode,
} from '../credentials/credential-store'
import {
  REALNAME_PROVIDERS,
  isRealnameProvider,
  realnameProviderMeta,
  type RealnameProvider,
} from './realname-verifier'

/* 实名核验运行时解析（P1）：凭据只从环境变量读取（credentialEnv 仅存变量名）。
 * 「联通」= 已启用 + 供应商合法 + 联通性测试通过；未联通时客户端显示「身份信息登记」。 */

export interface RealnameRuntime {
  provider: RealnameProvider
  config: Record<string, unknown>
  credentials: Record<string, string>
  credentialConfigured: boolean
  missingCredentials: string[]
}

export interface RealnameVerificationView {
  realnameVerifyEnabled: boolean
  realnameVerifyProvider: string
  realnameVerifyProviderLabel: string
  realnameVerifyConfig: Record<string, unknown>
  /** 凭据来源：inline=后台直接填写（只写/脱敏）；env=登记环境变量名 */
  realnameVerifyCredentialMode: CredentialMode
  /** env 模式下的变量名映射；inline 模式恒为空（不回传密钥） */
  realnameVerifyCredentialEnv: Record<string, string>
  /** 脱敏视图：inline 已配置 → 掩码；env → 变量名 */
  realnameVerifyCredentialMasked: Record<string, string>
  realnameVerifyCredentialConfigured: boolean
  realnameVerifyMissingCredentials: string[]
  realnameVerifyTestOk: boolean
  realnameVerifyTestedAt: string | null
  /** 派生模式：verified=实名认证（启用且已联通）；registration=身份信息登记 */
  realnameMode: 'verified' | 'registration'
}

/** 是否生效（客户端显示「实名认证」的充要条件）：启用 + 供应商合法 + 联通性测试通过 */
export function isRealnameVerificationEffective(row: SystemConfig | null): boolean {
  if (!row || !row.realnameVerifyEnabled) return false
  if (!isRealnameProvider(row.realnameVerifyProvider)) return false
  return row.realnameVerifyTestOk
}

export function realnameMode(row: SystemConfig | null): 'verified' | 'registration' {
  return isRealnameVerificationEffective(row) ? 'verified' : 'registration'
}

/** 运行时解析：启用 + 供应商合法 + 凭据齐备（不要求已测试联通，供联通测试使用） */
export function resolveRealnameRuntime(row: SystemConfig | null): RealnameRuntime | null {
  if (!row || !row.realnameVerifyEnabled) return null
  const provider = row.realnameVerifyProvider
  if (!isRealnameProvider(provider)) return null

  const meta = realnameProviderMeta(provider)
  const mode = realnameCredentialMode(row)
  const resolution = resolveCredential(
    mode,
    asStringRecord(row.realnameVerifyCredentialEnv),
    meta?.credentialKeys ?? [],
  )

  return {
    provider,
    config: asObject(row.realnameVerifyConfig),
    credentials: resolution.values,
    credentialConfigured: resolution.configured,
    missingCredentials: resolution.missing,
  }
}

/** 凭据来源模式（缺省 inline：后台直接填写） */
export function realnameCredentialMode(row: SystemConfig | null): CredentialMode {
  return normalizeCredentialMode(row?.realnameVerifyCredentialMode, 'inline')
}

export function realnameVerificationView(row: SystemConfig | null): RealnameVerificationView {
  const provider = row?.realnameVerifyProvider ?? ''
  const meta = realnameProviderMeta(provider)
  const mode = realnameCredentialMode(row)
  const resolution = resolveCredential(
    mode,
    asStringRecord(row?.realnameVerifyCredentialEnv),
    meta?.credentialKeys ?? [],
  )
  return {
    realnameVerifyEnabled: Boolean(row?.realnameVerifyEnabled),
    realnameVerifyProvider: provider,
    realnameVerifyProviderLabel: meta?.label ?? (provider || '未选择'),
    realnameVerifyConfig: asObject(row?.realnameVerifyConfig),
    realnameVerifyCredentialMode: mode,
    realnameVerifyCredentialEnv: resolution.envNames,
    realnameVerifyCredentialMasked: resolution.masked,
    realnameVerifyCredentialConfigured: resolution.configured,
    realnameVerifyMissingCredentials: resolution.missing,
    realnameVerifyTestOk: Boolean(row?.realnameVerifyTestOk),
    realnameVerifyTestedAt: row?.realnameVerifyTestedAt ?? null,
    realnameMode: realnameMode(row),
  }
}

export function realnameProviderOptions(): Array<{ provider: RealnameProvider; label: string }> {
  return REALNAME_PROVIDERS.map((provider) => ({
    provider,
    label: realnameProviderMeta(provider)?.label ?? provider,
  }))
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}
