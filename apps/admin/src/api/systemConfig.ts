import type { SystemConfig } from '@/types'
import { httpGet, httpPut } from './http'

/* GET /api/admin/system/config — 系统配置（单例，服务端 10min 缓存） */
export async function fetchSystemConfig(): Promise<SystemConfig> {
  return httpGet<SystemConfig>('/system/config')
}

export interface SystemConfigPayload {
  siteName: string
  siteSlogan: string
  registrationOpen: boolean
  mallOpen: boolean
  demandOpen: boolean
  reservationOpen: boolean
  realnameRequired: boolean
  homeCarouselOpen: boolean
  leaseExpireRemindDays: number
  uploadMaxSizeMb: number
  /** 密码有效期（天）：0=不启用 */
  passwordExpireDays: number
  minioEnabled: boolean
  minioEndpoint: string
  minioPort: number
  minioUseSsl: boolean
  minioAccessKey: string
  minioSecretKey: string
  minioBucket: string
}

/* PUT /api/admin/system/config — 保存系统配置（保存即生效并留痕）
 * 服务端校验：站点名称非空、租约临期提醒窗口 1-90 整数、上传文件大小限制 1-100 整数、密码有效期 0-3650 整数 */
export async function saveSystemConfig(payload: SystemConfigPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>('/system/config', payload)
}
