import { Injectable } from '@nestjs/common'
import type { SchedulerLog } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { RedisService } from '../../../common/redis/redis.service'
import { SchedulerService } from '../../../scheduler/scheduler.service'

/** 服务启动时间（模块加载即记录，用于 uptime 展示） */
const SERVICE_STARTED_AT = new Date()
const SERVICE_NAME = 'joinyuu-api'
/* 版本号取自 apps/api/package.json；静态 import 会让 tsc 把 JSON 纳入编译并改变 dist 输出结构，故用 require */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SERVICE_VERSION: string = (require('../../../../package.json') as { version: string }).version

export interface ServiceHealthDto {
  status: 'healthy' | 'degraded' | 'down'
  name: string
  version: string
  nodeEnv: string
  uptimeSec: number
  startedAt: string
  apiLatencyMs: number
  db: { status: 'up' | 'down'; latencyMs: number }
  redis: { status: 'up' | 'down'; latencyMs: number }
}

export interface RedisInfoDto {
  version: string
  usedMemory: string
  usedMemoryPeak: string
  totalSystemMemory: string
  keys: number
  hitRate: number
  connectedClients: number
  uptimeDays: number
}

export interface CronJobStatusDto {
  name: string
  cron: string
  enabled: boolean
  lastRunAt: string
  lastRunDurationMs: number
  lastResult: 'success' | 'failed' | 'unknown'
}

export interface MonitorOverviewDto {
  service: ServiceHealthDto
  redis: RedisInfoDto
  jobs: CronJobStatusDto[]
}

export interface CronRunLogDto {
  id: string
  jobName: string
  runAt: string
  durationMs: number
  result: 'success' | 'failed'
  detail: string
}

/* 系统监控：服务/DB/Redis 健康指标 + 定时任务最近执行状态与日志 */
@Injectable()
export class MonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scheduler: SchedulerService,
  ) {}

  async overview(): Promise<MonitorOverviewDto> {
    const apiT0 = Date.now()

    const dbT0 = Date.now()
    let dbUp = true
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      dbUp = false
    }
    const dbLatency = Date.now() - dbT0

    const redisLatency = await this.redis.ping()
    const redisUp = redisLatency >= 0
    const redisInfo = parseRedisInfo(await this.redis.info())

    const jobInfos = this.scheduler.listJobs()
    /* 一次聚合 + 一次取回各任务最近日志（避免逐任务 N+1）；DB 不可用时跳过，保证监控页在故障时仍可打开 */
    const lastByJob = dbUp && jobInfos.length > 0
      ? await this.latestLogsByJob(jobInfos.map((j) => j.name))
      : new Map<string, SchedulerLog>()
    const jobs: CronJobStatusDto[] = jobInfos.map((j) => {
      const last = lastByJob.get(j.name)
      return {
        name: j.name,
        cron: j.cron,
        enabled: j.enabled,
        lastRunAt: last?.startedAt ?? '',
        lastRunDurationMs: last?.durationMs ?? 0,
        lastResult: last ? (last.status === 'error' ? 'failed' : 'success') : 'unknown',
      }
    })

    const status: ServiceHealthDto['status'] = dbUp && redisUp ? 'healthy' : dbUp ? 'degraded' : 'down'

    return {
      service: {
        status,
        name: SERVICE_NAME,
        version: SERVICE_VERSION,
        nodeEnv: process.env.NODE_ENV ?? 'development',
        uptimeSec: Math.floor((Date.now() - SERVICE_STARTED_AT.getTime()) / 1000),
        startedAt: formatDateTimeSec(SERVICE_STARTED_AT),
        apiLatencyMs: Date.now() - apiT0,
        db: { status: dbUp ? 'up' : 'down', latencyMs: dbLatency },
        redis: { status: redisUp ? 'up' : 'down', latencyMs: Math.max(redisLatency, 0) },
      },
      redis: redisInfo,
      jobs,
    }
  }

  /** 各任务最近一条执行日志：一次 groupBy 取最大 startedAt（时间字符串按字典序即时序）+ 一次取回对应行 */
  private async latestLogsByJob(jobNames: string[]): Promise<Map<string, SchedulerLog>> {
    const latest = await this.prisma.schedulerLog.groupBy({
      by: ['jobName'],
      where: { jobName: { in: jobNames } },
      _max: { startedAt: true },
    })
    const rows = await this.prisma.schedulerLog.findMany({
      where: { OR: latest.map((g) => ({ jobName: g.jobName, startedAt: g._max.startedAt ?? '' })) },
    })
    return new Map(rows.map((log) => [log.jobName, log]))
  }

  async cronLogs(jobName?: string): Promise<CronRunLogDto[]> {
    const rows = await this.prisma.schedulerLog.findMany({
      where: jobName ? { jobName } : {},
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    })
    return rows.map((r) => ({
      id: r.id,
      jobName: r.jobName,
      runAt: r.startedAt,
      durationMs: r.durationMs,
      result: r.status === 'ok' ? 'success' : 'failed',
      detail: r.detail ?? '',
    }))
  }
}

/** 解析 Redis INFO 文本为展示指标 */
function parseRedisInfo(raw: string): RedisInfoDto {
  const map = new Map<string, string>()
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx > 0) map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
  }
  const hits = Number(map.get('keyspace_hits') ?? '0')
  const misses = Number(map.get('keyspace_misses') ?? '0')
  const total = hits + misses
  const db0 = map.get('db0') ?? ''
  const keysMatch = /keys=(\d+)/.exec(db0)
  return {
    version: map.get('redis_version') ?? '—',
    usedMemory: map.get('used_memory_human') ?? '—',
    usedMemoryPeak: map.get('used_memory_peak_human') ?? '—',
    totalSystemMemory: map.get('total_system_memory_human') ?? '—',
    keys: keysMatch ? Number(keysMatch[1]) : 0,
    hitRate: total > 0 ? Number((hits / total).toFixed(3)) : 0,
    connectedClients: Number(map.get('connected_clients') ?? '0'),
    uptimeDays: Number(map.get('uptime_in_days') ?? '0'),
  }
}

function formatDateTimeSec(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
