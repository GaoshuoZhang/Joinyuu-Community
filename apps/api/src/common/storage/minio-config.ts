import type { SystemConfig } from '@prisma/client'

/* MinIO 凭据与运行时配置解析（P0 密钥安全）：
 * - 凭据优先取环境变量（MINIO_ACCESS_KEY / MINIO_SECRET_KEY），未设置时回退数据库值；
 *   生产环境应仅经环境变量 / Secret Manager 注入，数据库值仅作历史兼容。
 * - 对外输出（管理端 GET、共享缓存、审计快照）一律不含 SecretKey 原文，只给"是否已配置"与脱敏值。
 * - StorageService 与 SystemConfigService / ConfigService 共用此处逻辑，保证各处结构完全一致。 */

export const MINIO_SECRET_KEY_ENV = 'MINIO_SECRET_KEY'
export const MINIO_ACCESS_KEY_ENV = 'MINIO_ACCESS_KEY'

const MASKED_SECRET = '********'
const DEFAULT_BUCKET = 'joinyuu'

export interface MinioRuntimeConfig {
  endPoint: string
  port: number
  useSSL: boolean
  accessKey: string
  secretKey: string
  bucket: string
}

/** 含原文的凭据解析结果：仅限服务端内部使用，禁止直接返回给前端或写入日志 */
export interface ResolvedMinioCredentials {
  accessKey: string
  secretKey: string
  source: 'env' | 'database' | 'none'
}

/** 可安全外发的凭据视图：不含 SecretKey 原文 */
export interface MinioCredentialView {
  /** 实际生效的 AccessKey（访问标识，非机密，供运维核对） */
  minioAccessKey: string
  /** SecretKey 是否已配置（环境变量或数据库任一存在即为 true） */
  minioSecretKeyConfigured: boolean
  /** SecretKey 脱敏展示值：已配置为固定掩码，否则为空串 */
  minioSecretKeyMasked: string
  /** 凭据来源：env 优先，其次 database；未配置为 none */
  minioCredentialSource: 'env' | 'database' | 'none'
}

function envValue(key: string): string {
  return (process.env[key] ?? '').trim()
}

/** 解析生效凭据（env 优先，回退数据库）。返回含原文，仅供内部运行时使用。 */
export function resolveMinioCredentials(
  config: Pick<SystemConfig, 'minioAccessKey' | 'minioSecretKey'>,
): ResolvedMinioCredentials {
  const envAccessKey = envValue(MINIO_ACCESS_KEY_ENV)
  const envSecretKey = envValue(MINIO_SECRET_KEY_ENV)
  const dbAccessKey = (config.minioAccessKey ?? '').trim()
  const dbSecretKey = (config.minioSecretKey ?? '').trim()

  const accessKey = envAccessKey || dbAccessKey
  const secretKey = envSecretKey || dbSecretKey
  const source: ResolvedMinioCredentials['source'] =
    envAccessKey || envSecretKey ? 'env' : secretKey ? 'database' : 'none'

  return { accessKey, secretKey, source }
}

/** 凭据脱敏视图：禁止把 SecretKey 原文带出本模块 */
export function toMinioCredentialView(credentials: ResolvedMinioCredentials): MinioCredentialView {
  return {
    minioAccessKey: credentials.accessKey,
    minioSecretKeyConfigured: Boolean(credentials.secretKey),
    minioSecretKeyMasked: credentials.secretKey ? MASKED_SECRET : '',
    minioCredentialSource: credentials.source,
  }
}

/** 管理端/共享缓存使用的 MinIO 配置片段（已脱敏，与 SystemConfig 其余字段合并下发） */
export function minioConfigView(config: SystemConfig): MinioCredentialView & {
  minioEnabled: boolean
  minioEndpoint: string
  minioPort: number
  minioUseSsl: boolean
  minioBucket: string
} {
  return {
    minioEnabled: config.minioEnabled,
    minioEndpoint: config.minioEndpoint,
    minioPort: config.minioPort,
    minioUseSsl: config.minioUseSsl,
    minioBucket: config.minioBucket,
    ...toMinioCredentialView(resolveMinioCredentials(config)),
  }
}

/** 运行时配置解析：未启用、Endpoint 缺失或凭据不全时返回 null（回退本地磁盘驱动） */
export function resolveMinioRuntimeConfig(config: SystemConfig | null): MinioRuntimeConfig | null {
  if (!config || !config.minioEnabled) return null
  const endpoint = (config.minioEndpoint ?? '').trim()
  if (!endpoint) return null
  const credentials = resolveMinioCredentials(config)
  if (!credentials.accessKey || !credentials.secretKey) return null
  return {
    endPoint: endpoint,
    port: config.minioPort,
    useSSL: config.minioUseSsl,
    accessKey: credentials.accessKey,
    secretKey: credentials.secretKey,
    bucket: config.minioBucket || DEFAULT_BUCKET,
  }
}
