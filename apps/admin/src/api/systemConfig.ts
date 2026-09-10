import type { SystemConfig } from '@/types'
import { httpGet, httpPut } from './http'

/* 已接入 M1 真实接口：GET /api/admin/system/config — 系统配置（单例，服务端 10min 缓存） */
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
  dailyLoginPoints: boolean
  leaseExpireRemindDays: number
}

/* 已接入 M1 真实接口：PUT /api/admin/system/config — 保存系统配置（保存即生效并留痕）
 * 服务端校验：站点名称非空、租约临期提醒窗口 1-90 整数（错误文案与 M0 一致） */
export async function saveSystemConfig(payload: SystemConfigPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>('/system/config', payload)
}
