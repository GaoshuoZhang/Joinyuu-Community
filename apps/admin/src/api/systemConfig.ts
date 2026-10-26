import type { SystemConfig } from '@/types'
import { httpGet, httpPost, httpPut } from './http'

/* GET /api/admin/system/config — 系统配置（单例，服务端 10min 缓存） */
export async function fetchSystemConfig(): Promise<SystemConfig> {
  return httpGet<SystemConfig>('/system/config')
}

/** GET /api/admin/branding — 后台壳品牌（站点名称 + 站点标语 + 站点 logo）：仅需登录，不挂权限码 */
export interface AdminBranding {
  siteName: string
  siteSlogan: string
  siteLogo: string
}

export async function fetchBranding(): Promise<AdminBranding> {
  return httpGet<AdminBranding>('/branding')
}

export interface SystemConfigPayload {
  siteName: string
  siteSlogan: string
  /** 站点 logo（素材 URL）：后台左上角图标与浏览器标签页图标；空串 = 清除并回退默认字标 */
  siteLogo: string
  mobileUrl: string
  registrationOpen: boolean
  /** 手机号/邮箱注册渠道开关（仅 registrationOpen=true 时生效）：关闭后不允许该渠道注册新账号 */
  phoneRegisterOpen: boolean
  emailRegisterOpen: boolean
  mallOpen: boolean
  demandOpen: boolean
  reservationOpen: boolean
  realnameRequired: boolean
  homeCarouselOpen: boolean
  leaseExpireRemindDays: number
  uploadMaxSizeMb: number
  /** 密码过期强制改密（仅后台管理员账号）：关闭（默认）= 密码永不过期 */
  passwordExpireEnabled: boolean
  /** 密码过期周期（天，1-3650）：仅 passwordExpireEnabled=true 时生效 */
  passwordExpireDays: number
  /** P1 实名核验：是否启用权威二要素核验 */
  realnameVerifyEnabled: boolean
  /** 核验供应商（单选）：'' 未选择 | aliyun | tencent */
  realnameVerifyProvider: string
  /** 凭据来源：inline 后台直接填写（只写，留空保持原值）| env 登记环境变量名 */
  realnameVerifyCredentialMode?: 'inline' | 'env'
  /** 非机密参数（endpoint / region） */
  realnameVerifyConfig?: Record<string, unknown>
  /** 凭据：inline 模式填密钥值（留空保持不变）；env 模式填环境变量名 */
  realnameVerifyCredentialEnv?: Record<string, string>
  minioEnabled: boolean
  minioEndpoint: string
  minioPort: number
  minioUseSsl: boolean
  minioAccessKey: string
  /** 只写字段：留空/缺省 = 保持原值不变；非空 = 更新或轮换。服务端不回传原文。 */
  minioSecretKey?: string
  minioBucket: string
}

/* PUT /api/admin/system/config — 保存系统配置（保存即生效并留痕）
 * 服务端校验：站点名称非空、租约临期提醒窗口 1-90 整数、上传文件大小限制 1-100 整数、密码过期周期 1-3650 整数
 * 密钥安全：minioSecretKey 为只写字段，留空表示保持原值，不回传原文 */
export async function saveSystemConfig(payload: SystemConfigPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>('/system/config', payload)
}

/* ---------- P1 实名核验（权威二要素） ---------- */

export interface RealnameCredentialField {
  key: string
  label: string
  required?: boolean
}

export interface RealnameConfigField {
  key: string
  label: string
  required?: boolean
  hint?: string
}

export interface RealnameProviderMeta {
  provider: string
  label: string
  configFields: RealnameConfigField[]
  credentialKeys: RealnameCredentialField[]
}

export interface RealnameCatalog {
  options: Array<{ provider: string; label: string }>
  meta: RealnameProviderMeta[]
}

/* GET /api/admin/system/config/realname/catalog — 核验供应商目录 */
export async function fetchRealnameCatalog(): Promise<RealnameCatalog> {
  return httpGet<RealnameCatalog>('/system/config/realname/catalog')
}

/* POST /api/admin/system/config/realname/test — 测试联通（接口可调用即算联通） */
export async function testRealnameVerification(): Promise<{ ok: boolean; message: string; provider: string }> {
  return httpPost<{ ok: boolean; message: string; provider: string }>('/system/config/realname/test')
}
