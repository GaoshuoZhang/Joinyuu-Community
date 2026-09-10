import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../common/prisma/prisma.service'
import { IdGeneratorService } from '../common/id-generator/id-generator.service'
import { formatNow, formatToday } from '../common/utils/time'

/* 定时任务（wiki-backend.md §8.2）：
 * (1) 定时发布扫描：demands/events 中 scheduled 且到点 → published（活动同时开放报名）+ 写 schedule 通知；
 * (2) 活动自动结束：published 且 endTime 到点 → ended。
 * 单实例部署，无需分布式锁。@Cron 方法仅转发到公开方法，e2e 直接调用公开方法免等待。 */
@Injectable()
export class SchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'demands-events-scheduled-publish' })
  async handleScheduledPublish(): Promise<void> {
    await this.scanScheduledPublish()
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'events-auto-end' })
  async handleAutoEnd(): Promise<void> {
    await this.scanAutoEnd()
  }

  @Cron('0 9 * * *', { name: 'lease-expiring-notify' })
  async handleLeaseExpiring(): Promise<void> {
    await this.scanLeaseExpiring()
  }

  /** 到点发布扫描：状态迁移与通知写入置于同一事务，避免"已发布但通知缺失"的部分失败 */
  async scanScheduledPublish(): Promise<void> {
    const now = formatNow()

    await this.prisma.$transaction(async (tx) => {
      const demands = await tx.demand.findMany({
        where: { status: 'scheduled', scheduledAt: { lte: now } },
      })
      const events = await tx.communityEvent.findMany({
        where: { status: 'scheduled', scheduledAt: { lte: now } },
      })

      if (demands.length > 0) {
        await tx.demand.updateMany({
          where: { status: 'scheduled', scheduledAt: { lte: now } },
          data: { status: 'published', publishedAt: now },
        })
      }
      if (events.length > 0) {
        await tx.communityEvent.updateMany({
          where: { status: 'scheduled', scheduledAt: { lte: now } },
          data: { status: 'published', enrollmentOpen: true },
        })
      }

      for (const d of demands) {
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
    })
  }

  /** 活动自动结束：published 且 endTime 到点 → ended（无通知） */
  async scanAutoEnd(): Promise<void> {
    const now = formatNow()
    await this.prisma.communityEvent.updateMany({
      where: { status: 'published', endTime: { lte: now } },
      data: { status: 'ended' },
    })
  }

  /** 租约临期通知（wiki-backend.md §8.2）：active 且非长期租约 endDate 落在临期窗口
   * （SystemConfig.leaseExpireRemindDays，默认 15）→ 写 lease 通知；同一租约同日去重
   * （匹配 type=lease 且 content 含租约 ID 且 at 日期前缀为今日）。 */
  async scanLeaseExpiring(): Promise<void> {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    const days = config?.leaseExpireRemindDays ?? 15
    const today = formatToday()
    const windowEnd = this.addDays(today, days)
    const now = formatNow()

    const leases = await this.prisma.lease.findMany({
      where: { status: 'active', longTerm: false, endDate: { gte: today, lte: windowEnd } },
    })
    if (leases.length === 0) return

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
  }

  /** 日期字符串加天数（YYYY-MM-DD），对齐 M0 addDays 语义 */
  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setDate(d.getDate() + days)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
}
