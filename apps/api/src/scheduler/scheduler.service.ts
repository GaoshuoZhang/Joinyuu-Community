import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../common/prisma/prisma.service'
import { IdGeneratorService } from '../common/id-generator/id-generator.service'
import { formatNow } from '../common/utils/time'

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

  /** 到点发布扫描：先取受影响行（构造通知），再 updateMany；活动发布时同时开放报名 */
  async scanScheduledPublish(): Promise<void> {
    const now = formatNow()

    const demands = await this.prisma.demand.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: now } },
    })
    const events = await this.prisma.communityEvent.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: now } },
    })

    if (demands.length > 0) {
      await this.prisma.demand.updateMany({
        where: { status: 'scheduled', scheduledAt: { lte: now } },
        data: { status: 'published', publishedAt: now },
      })
    }
    if (events.length > 0) {
      await this.prisma.communityEvent.updateMany({
        where: { status: 'scheduled', scheduledAt: { lte: now } },
        data: { status: 'published', enrollmentOpen: true },
      })
    }

    for (const d of demands) {
      await this.prisma.adminNotification.create({
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
      await this.prisma.adminNotification.create({
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
  }

  /** 活动自动结束：published 且 endTime 到点 → ended（无通知） */
  async scanAutoEnd(): Promise<void> {
    const now = formatNow()
    await this.prisma.communityEvent.updateMany({
      where: { status: 'published', endTime: { lte: now } },
      data: { status: 'ended' },
    })
  }
}
