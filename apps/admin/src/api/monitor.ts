import { httpGet } from './http'

/* 系统监控 API（/api/admin/monitor/*）
 * 服务名/定时任务取自后端 scheduler.service.ts */

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'down'
  name: string
  version: string
  nodeEnv: string
  /** 运行秒数（前端格式化为 X 天 X 时） */
  uptimeSec: number
  startedAt: string
  apiLatencyMs: number
  db: { status: 'up' | 'down'; latencyMs: number }
  redis: { status: 'up' | 'down'; latencyMs: number }
}

export interface RedisInfo {
  version: string
  usedMemory: string
  usedMemoryPeak: string
  totalSystemMemory: string
  keys: number
  /** 缓存命中率 0-1 */
  hitRate: number
  connectedClients: number
  uptimeDays: number
}

export interface CronJobStatus {
  name: string
  cron: string
  enabled: boolean
  lastRunAt: string
  lastRunDurationMs: number
  /** unknown = 无执行记录（如数据库不可用时仅返回任务定义） */
  lastResult: 'success' | 'failed' | 'unknown'
}

export interface CronRunLog {
  id: string
  jobName: string
  runAt: string
  durationMs: number
  result: 'success' | 'failed'
  detail: string
}

export interface MonitorOverview {
  service: ServiceHealth
  redis: RedisInfo
  jobs: CronJobStatus[]
}

/** GET /api/admin/monitor/overview */
export async function fetchMonitorOverview(): Promise<MonitorOverview> {
  return httpGet<MonitorOverview>('/monitor/overview')
}

/** GET /api/admin/monitor/cron-logs?jobName */
export async function fetchCronLogs(jobName?: string): Promise<CronRunLog[]> {
  const qs = jobName ? `?jobName=${encodeURIComponent(jobName)}` : ''
  return httpGet<CronRunLog[]>(`/monitor/cron-logs${qs}`)
}
