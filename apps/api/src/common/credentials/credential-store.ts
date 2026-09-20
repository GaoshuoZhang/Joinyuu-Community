/* 凭据存储与解析（P1）：支持两种来源
 * - inline：后台直接填写密钥值 —— 只写（留空=保持原值）、对外只回脱敏值、不进审计快照；
 * - env：登记环境变量名，值由部署侧注入。
 * 实名核验与消息渠道共用，保证口径一致。 */

export type CredentialMode = 'inline' | 'env'

export const CREDENTIAL_MODES: readonly CredentialMode[] = ['inline', 'env']

export interface CredentialField {
  key: string
  label: string
  required?: boolean
}

export interface CredentialResolution {
  mode: CredentialMode
  /** 实际可用凭据值（inline=库内值；env=环境变量值）；仅供服务端调用供应商使用 */
  values: Record<string, string>
  configured: boolean
  /** 缺失项：inline 为字段标签；env 为环境变量名（便于运维核对） */
  missing: string[]
  /** 对外脱敏视图：inline 已配置 → 固定掩码；env → 仅回变量名（本身非机密） */
  masked: Record<string, string>
  /** env 模式的变量名映射（inline 模式为空对象） */
  envNames: Record<string, string>
}

const ENV_NAME = /^[A-Z][A-Z0-9_]{2,63}$/
const MASKED = '********'
const MAX_INLINE_LENGTH = 256

/** 环境变量名（大写字母开头，仅含大写字母/数字/下划线） */
export function isEnvVarName(value: string): boolean {
  return ENV_NAME.test(value.trim())
}

export function normalizeCredentialMode(value: unknown, fallback: CredentialMode): CredentialMode {
  const mode = String(value ?? '').trim()
  return (CREDENTIAL_MODES as readonly string[]).includes(mode) ? (mode as CredentialMode) : fallback
}

/** 解析可用于调用的凭据值（禁止把 values 返回给前端或写入审计） */
export function resolveCredential(
  mode: CredentialMode,
  stored: Record<string, string>,
  fields: readonly CredentialField[],
): CredentialResolution {
  const values: Record<string, string> = {}
  const masked: Record<string, string> = {}
  const envNames: Record<string, string> = {}
  const missing: string[] = []

  for (const field of fields) {
    const raw = (stored[field.key] ?? '').trim()
    if (mode === 'env') {
      const fromEnv = raw ? (process.env[raw] ?? '').trim() : ''
      values[field.key] = fromEnv
      if (raw) envNames[field.key] = raw
      if (fromEnv) masked[field.key] = raw
      if (!fromEnv) missing.push(raw || `${field.label}（未登记环境变量）`)
      continue
    }
    values[field.key] = raw
    if (raw) masked[field.key] = MASKED
    if (!raw) missing.push(field.label)
  }

  return { mode, values, configured: missing.length === 0, missing, masked, envNames }
}

/** 入参格式校验：env 模式必须是合法环境变量名；inline 模式仅限制长度与可见字符；未知键一律拒绝 */
export function validateCredentialInput(
  mode: CredentialMode,
  input: unknown,
  fields: readonly CredentialField[],
  subjectLabel = '驱动',
): Record<string, string> {
  const allowed = new Set(fields.map((field) => field.key))
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(asStringRecord(input))) {
    if (!allowed.has(key)) {
      throw new Error(
        `凭据项 ${key} 不属于该${subjectLabel}（允许：${[...allowed].join('、') || '无'}）`,
      )
    }
    if (mode === 'env') {
      if (!isEnvVarName(value)) {
        throw new Error(`环境变量名不合法：${value}（大写字母开头，仅含大写字母/数字/下划线）`)
      }
    } else if (value.length > MAX_INLINE_LENGTH) {
      throw new Error(`${key} 长度超出限制（≤${MAX_INLINE_LENGTH}）`)
    }
    out[key] = value
  }
  return out
}

/** 写入合并：inline 模式空值/缺键=保持原值（只写语义）；env 模式空值=清除。
 * 注意需按「入参与既有键的并集」遍历，否则客户端不发送任何键时会把已存凭据清空。 */
export function mergeCredentialInput(
  mode: CredentialMode,
  incoming: Record<string, string>,
  previous: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = {}
  const keys = new Set([...Object.keys(previous), ...Object.keys(incoming)])
  for (const key of keys) {
    const value = (incoming[key] ?? '').trim()
    if (!value) {
      if (mode === 'inline') {
        const kept = (previous[key] ?? '').trim()
        if (kept) merged[key] = kept
      }
      continue
    }
    merged[key] = value
  }
  return merged
}

export function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item != null && String(item).trim()) out[key] = String(item).trim()
  }
  return out
}
