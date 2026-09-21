import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../common/prisma/prisma.service'
import { IdGeneratorService } from '../common/id-generator/id-generator.service'
import { RedisService } from '../common/redis/redis.service'
import { TrashService } from '../modules/system/trash/trash.service'
import { OutboxService } from '../modules/messaging/outbox.service'
import { formatNow, formatNowSec, formatToday } from '../common/utils/time'
import { PointsEngineService } from '../common/engine/points-engine/points-engine.service'
import { AuditService } from '../common/audit/audit.service'

/** 任务级互斥锁 TTL（秒）：单实例单任务执行时长上限，超时后锁自动释放 */
const JOB_LOCK_TTL_SEC = 60 * 15

export interface SchedulerJobInfo {
  name: string
  /** 周期展示文案 */
  cron: string
  enabled: boolean
}

interface JobDefinition extends SchedulerJobInfo {
  run: () => Promise<number>
}

/* 定时任务（wiki-backend.md §8.2，含执行日志）：
 * (1) 定时发布扫描：demands/events/articles 中 scheduled 且到点 → published（活动同时开放报名）+ 写 schedule 通知；
 * (2) 活动自动结束：published 且 endTime 到点 → ended；
 * (3) 租约临期通知。
 * 每次执行写入 SchedulerLog（监控页数据源）；@Cron 方法转发到 runJob，e2e 可直接调用 scanXxx/runJob。 */
@Injectable()
export class SchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly trash: TrashService,
    private readonly points: PointsEngineService,
    private readonly outbox: OutboxService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  /** 任务注册表（监控页展示 + 手动触发入口） */
  private get jobs(): JobDefinition[] {
    return [
      {
        name: 'demands-events-scheduled-publish',
        cron: '每 30 秒',
        enabled: true,
        run: () => this.scanScheduledPublish(),
      },
      {
        name: 'articles-scheduled-publish',
        cron: '每 30 秒',
        enabled: true,
        run: () => this.scanArticleScheduledPublish(),
      },
      { name: 'events-auto-end', cron: '每 5 分钟', enabled: true, run: () => this.scanAutoEnd() },
      /* 冻结到期自动解冻：避免「临时冻结」因无到期任务而变成永久冻结 */
      { name: 'user-freeze-expire', cron: '每 5 分钟', enabled: true, run: () => this.scanFreezeExpire() },
      { name: 'lease-expiring-notify', cron: '每天 09:00', enabled: true, run: () => this.scanLeaseExpiring() },
      { name: 'archive-auto-archive', cron: '每 5 分钟', enabled: true, run: () => this.trash.runAutoArchive() },
      { name: 'archive-auto-purge', cron: '每 5 分钟', enabled: true, run: () => this.trash.runAutoPurge() },
      /* P0 消息投递：扫描 Outbox 到期消息，重试退避与死信由 OutboxService 内部处理 */
      { name: 'message-outbox-dispatch', cron: '每 30 秒', enabled: true, run: () => this.outbox.processPending(50) },
    ]
  }

  listJobs(): SchedulerJobInfo[] {
    return this.jobs.map((j) => ({ name: j.name, cron: j.cron, enabled: j.enabled }))
  }

  /** 执行任务并记录 SchedulerLog（手动触发与 @Cron 共用）
   * BE-M3 修复：执行前用 Redis 抢占任务级互斥锁。多实例/手动触发与 @Cron 并发时，
   * 只有持有锁的实例执行，其余跳过（写入跳过日志），避免重复通知/重复积分。 */
  async runJob(name: string): Promise<{ code: number }> {
    const job = this.jobs.find((j) => j.name === name)
    if (!job) throw new NotFoundException('任务不存在')

    /* 互斥锁：抢不到说明另一实例正在执行（Redis 故障时 fail-open 放行，保证主流程可用） */
    const lockKey = `scheduler:lock:${name}`
    const acquired = await this.redis.acquireFlag(lockKey, JOB_LOCK_TTL_SEC)
    if (!acquired) {
      console.warn(`[scheduler] 任务 ${name} 已被其他实例执行，本次跳过`)
      await this.writeLog(name, formatNowSec(), 0, 'ok', '另一实例正在执行，本次跳过', 0)
      return { code: 0 }
    }
    try {
      return await this.runJobUnlocked(name, job.run)
    } finally {
      await this.redis.delCache(lockKey)
    }
  }

  private async runJobUnlocked(name: string, run: () => Promise<number>): Promise<{ code: number }> {
    const startedAt = formatNowSec()
    const t0 = Date.now()
    try {
      const rows = await run()
      await this.writeLog(name, startedAt, Date.now() - t0, 'ok', rows > 0 ? `影响 ${rows} 行` : '无待处理数据', rows)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await this.writeLog(name, startedAt, Date.now() - t0, 'error', msg, 0)
      console.error(`[scheduler] 任务 ${name} 执行失败:`, msg)
      /* 手动触发时向前端透出失败（@Cron 场景由调度器兜底记录） */
      throw new InternalServerErrorException(`任务执行失败：${msg}`)
    }
    return { code: 0 }
  }

  private async writeLog(
    jobName: string,
    startedAt: string,
    durationMs: number,
    status: 'ok' | 'error',
    detail: string,
    rowsAffected: number,
  ): Promise<void> {
    try {
      await this.prisma.schedulerLog.create({
        data: {
          id: await this.ids.next('SL'),
          jobName,
          startedAt,
          finishedAt: formatNowSec(),
          durationMs,
          status,
          detail: detail.slice(0, 255),
          rowsAffected,
        },
      })
    } catch (e) {
      console.error('[scheduler] 执行日志写入失败:', e instanceof Error ? e.message : e)
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'demands-events-scheduled-publish' })
  async handleScheduledPublish(): Promise<void> {
    await this.runJob('demands-events-scheduled-publish')
  }

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'articles-scheduled-publish' })
  async handleArticleScheduledPublish(): Promise<void> {
    await this.runJob('articles-scheduled-publish')
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'events-auto-end' })
  async handleAutoEnd(): Promise<void> {
    await this.runJob('events-auto-end')
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'user-freeze-expire' })
  async handleFreezeExpire(): Promise<void> {
    await this.runJob('user-freeze-expire')
  }

  @Cron('0 9 * * *', { name: 'lease-expiring-notify' })
  async handleLeaseExpiring(): Promise<void> {
    await this.runJob('lease-expiring-notify')
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'archive-auto-archive' })
  async handleAutoArchive(): Promise<void> {
    await this.runJob('archive-auto-archive')
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'archive-auto-purge' })
  async handleAutoPurge(): Promise<void> {
    await this.runJob('archive-auto-purge')
  }

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'message-outbox-dispatch' })
  async handleOutboxDispatch(): Promise<void> {
    await this.runJob('message-outbox-dispatch')
  }

  /** 到点发布扫描：状态迁移与通知写入置于同一事务，避免"已发布但通知缺失"的部分失败 */
  async scanScheduledPublish(): Promise<number> {
    const now = formatNow()

    return this.prisma.$transaction(async (tx) => {
      const demands = await tx.demand.findMany({
        where: { status: 'scheduled', scheduledAt: { lte: now }, deletedAt: null },
      })
      const events = await tx.communityEvent.findMany({
        where: { status: 'scheduled', scheduledAt: { lte: now }, deletedAt: null },
      })

      if (demands.length > 0) {
        await tx.demand.updateMany({
          where: { status: 'scheduled', scheduledAt: { lte: now }, deletedAt: null },
          data: { status: 'published', publishedAt: now },
        })
      }
      if (events.length > 0) {
        await tx.communityEvent.updateMany({
          where: { status: 'scheduled', scheduledAt: { lte: now }, deletedAt: null },
          data: { status: 'published', enrollmentOpen: true },
        })
      }

      for (const d of demands) {
        await this.points.issuePointsInTransaction(tx, d.publisherId, 'demand_published', '需求定时发布', `demand_published:${d.id}`)
        await tx.adminNotification.create({
          data: {
            id: await this.ids.next('N'),
            type: 'schedule',
            title: '需求已定时发布',
            content: `「${d.title}」已到点自动发布。`,
            at: now,
            read: false,
            link: '/demands',
          },
        })
      }
      for (const e of events) {
        await tx.adminNotification.create({
          data: {
            id: await this.ids.next('N'),
            type: 'schedule',
            title: '活动已定时发布',
            content: `「${e.title}」已到点自动发布，报名已开放。`,
            at: now,
            read: false,
            link: '/events',
          },
        })
      }
      return demands.length + events.length
    })
  }

  /** 文章定时发布：scheduled 且到点 → published */
  async scanArticleScheduledPublish(): Promise<number> {
    const now = formatNow()
    const articles = await this.prisma.article.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: now }, deletedAt: null },
    })
    if (articles.length === 0) return 0

    await this.prisma.$transaction(async (tx) => {
      await tx.article.updateMany({
        where: { status: 'scheduled', scheduledAt: { lte: now }, deletedAt: null },
        data: { status: 'published', publishedAt: now },
      })
      for (const a of articles) {
        if (a.channel === 'submitted' && a.authorId) {
          await this.points.issuePointsInTransaction(tx, a.authorId, 'article_accepted', '投稿定时发布', `article_accepted:${a.id}`)
        }
        await tx.adminNotification.create({
          data: {
            id: await this.ids.next('N'),
            type: 'schedule',
            title: '文章已定时发布',
            content: `「${a.title}」已到点自动发布。`,
            at: now,
            read: false,
            link: '/contents/publish',
          },
        })
      }
    })
    return articles.length
  }

  /** 活动自动结束：published 且 endTime 到点 → ended（无通知） */
  async scanAutoEnd(): Promise<number> {
    const now = formatNow()
    const res = await this.prisma.communityEvent.updateMany({
      where: { status: 'published', endTime: { lte: now }, deletedAt: null },
      data: { status: 'ended', archivableAt: now },
    })
    return res.count
  }

  /** 冻结到期自动解冻（每 5 分钟）：临时冻结（frozenUntil 非空且已到点）自动置回 active 并留痕；
   * 长期冻结 frozenUntil 为空，不受影响（需人工解冻）。 */
  async scanFreezeExpire(): Promise<number> {
    const now = formatNow()
    const expired = await this.prisma.user.findMany({
      where: { status: 'frozen', frozenUntil: { not: null, lte: now } },
      select: { uid: true, nickname: true, frozenReason: true, frozenUntil: true },
    })
    if (expired.length === 0) return 0

    /* 条件更新兜底：仅当仍为 frozen 且期限确实到点才解冻，与人工解冻并发时不重复处理 */
    const res = await this.prisma.user.updateMany({
      where: { uid: { in: expired.map((u) => u.uid) }, status: 'frozen', frozenUntil: { not: null, lte: now } },
      data: { status: 'active', frozenUntil: null, frozenReason: null },
    })

    for (const user of expired) {
      await this.audit.record({
        module: '社区成员',
        action: '冻结到期自动解冻',
        target: `${user.uid} · ${user.nickname}`,
        detail: `冻结期限 ${user.frozenUntil ?? ''} 已到点，系统自动解冻`,
        before: { status: 'frozen', frozenUntil: user.frozenUntil ?? null, frozenReason: user.frozenReason ?? null },
        after: { status: 'active', frozenUntil: null },
        operator: '系统',
      })
    }
    return res.count
  }

  /** 租约临期通知（wiki-backend.md §8.2）：active 且非长期租约 endDate 落在临期窗口
   * （SystemConfig.leaseExpireRemindDays，默认 15）→ 写 lease 通知；同一租约同日去重
   * （匹配 type=lease 且 content 含租约 ID 且 at 日期前缀为今日）。 */
  async scanLeaseExpiring(): Promise<number> {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    const days = config?.leaseExpireRemindDays ?? 15
    const today = formatToday()
    const windowEnd = this.addDays(today, days)
    const now = formatNow()

    const leases = await this.prisma.lease.findMany({
      where: { status: 'active', longTerm: false, endDate: { gte: today, lte: windowEnd } },
    })
    if (leases.length === 0) return 0

    /* 一次性取出今日已发的所有租约通知，内存去重（替代逐租约 findFirst 的 N+1） */
    const notifiedContents = await this.prisma.adminNotification.findMany({
      where: { type: 'lease', at: { startsWith: today } },
      select: { content: true },
    })
    const notifiedIds = new Set<string>()
    for (const n of notifiedContents) {
      const m = /租约 ([A-Z]+\d+)/.exec(n.content)
      if (m) notifiedIds.add(m[1])
    }

    const toCreate = leases.filter((lease) => !notifiedIds.has(lease.id))
    await this.prisma.$transaction(async (tx) => {
      for (const lease of toCreate) {
        await tx.adminNotification.create({
          data: {
            id: await this.ids.next('N'),
            type: 'lease',
            title: `租约 ${lease.id}（${lease.renterName}）即将到期`,
            content: `租约 ${lease.id}（${lease.renterName}）即将到期，请及时处理续期。`,
            at: now,
            read: false,
            link: '/workstations/leases',
          },
        })
      }
    })
    return toCreate.length
  }

  /** 日期字符串加天数（YYYY-MM-DD），对齐 addDays 语义 */
  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setDate(d.getDate() + days)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
}
