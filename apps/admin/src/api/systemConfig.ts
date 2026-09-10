import type { SystemConfig } from '@/types'
import { systemConfig } from '@/mock'
import { delay } from './utils'
import { recordAudit } from './auditLogs'

/* TODO: 替换为 GET /api/admin/system/config — 系统配置（单例） */
export async function fetchSystemConfig(): Promise<SystemConfig> {
  await delay(300)
  return { ...systemConfig }
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

/* TODO: 替换为 PUT /api/admin/system/config — 保存系统配置（保存即生效） */
export async function saveSystemConfig(payload: SystemConfigPayload): Promise<{ code: number }> {
  await delay(450)
  if (!payload.siteName.trim()) throw new Error('站点名称不能为空')
  if (!Number.isInteger(payload.leaseExpireRemindDays) || payload.leaseExpireRemindDays < 1 || payload.leaseExpireRemindDays > 90)
    throw new Error('租约临期提醒窗口须为 1-90 的整数')
  systemConfig.siteName = payload.siteName.trim()
  systemConfig.siteSlogan = payload.siteSlogan.trim()
  systemConfig.registrationOpen = payload.registrationOpen
  systemConfig.mallOpen = payload.mallOpen
  systemConfig.demandOpen = payload.demandOpen
  systemConfig.reservationOpen = payload.reservationOpen
  systemConfig.dailyLoginPoints = payload.dailyLoginPoints
  systemConfig.leaseExpireRemindDays = payload.leaseExpireRemindDays
  systemConfig.updatedAt = formatNow()
  systemConfig.updatedBy = '社区管理员'
  recordAudit('系统管理', '保存系统配置', '系统配置', `临期提醒 ${payload.leaseExpireRemindDays} 天`)
  return { code: 0 }
}

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
