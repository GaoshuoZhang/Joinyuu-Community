import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { RedisService } from '../../common/redis/redis.service'
import { CACHE_KEYS, CACHE_TTL } from '../../common/redis/cache-keys'
import { addDays, formatNow, formatToday } from '../../common/utils/time'
import { toEventDto } from '../events/event-dto'

export interface TodoSummary {
  key: string
  title: string
  description: string
  count: number
  route: string
}

/** 趋势点（与前端 TrendPoint 契约一致：date= M-DD） */
export interface TrendPointDto {
  date: string
  members: number
  demands: number
  events: number
  points: number
}

/* 工作台聚合（wiki-backend.md §7.16/§10）：
 * stats 派生计数 + 六域待办 + 待办审核前 5 + 近期活动前 4（未结束已发布，按开始时间升序）。
 * 口径与各域列表页一致。
 * 聚合结果走 dashboard:summary 缓存 60s（待办实时性优先，短 TTL 自然过期）；
 * 临期租约窗口取 SystemConfig.leaseExpireRemindDays（默认 15，与租约临期通知任务同源）。 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getDashboard(): Promise<Record<string, unknown>> {
    return this.redis.remember(CACHE_KEYS.dashboardSummary, CACHE_TTL.dashboard, () => this.loadDashboard())
  }

  async getTodos(): Promise<TodoSummary[]> {
    const c = await this.todoCounts()
    return [
      { key: 'settle', title: '入驻/合作/身份审核', description: '企业入驻、个体入驻、企业合作与身份绑定待审核', count: c.settle, route: '/approvals' },
      { key: 'demand', title: '需求审核', description: '待审核需求，通过后转待发布', count: c.demand, route: '/demands/review' },
      { key: 'reservation', title: '空间预约审核', description: '待审核的空间预约申请', count: c.reservation, route: '/spaces/reservations' },
      { key: 'showcase', title: '展示页发布', description: '企业/个人展示页发布申请', count: c.showcase, route: '/contents/showcase' },
      { key: 'article', title: '文章审核', description: '待审核的资讯文章', count: c.article, route: '/contents/submissions' },
      { key: 'lease', title: '临期租约', description: '15 天内到期的租约，请跟进续期', count: c.lease, route: '/workstations/leases' },
    ]
  }

  /** 运营趋势：按日聚合 成员注册 / 需求新增 / 活动新增 / 积分发放（含补零） */
  async getTrend(days: number): Promise<TrendPointDto[]> {
    const span = Math.min(Math.max(Number(days) || 30, 3), 90)
    const today = formatToday()
    const start = addDays(today, -(span - 1))

    const [users, demands, events, points] = await Promise.all([
      this.prisma.user.findMany({ where: { registeredAt: { gte: start } }, select: { registeredAt: true } }),
      this.prisma.demand.findMany({
        where: { createdAt: { gte: start }, deletedAt: null },
        select: { createdAt: true },
      }),
      this.prisma.communityEvent.findMany({
        where: { createdAt: { gte: start }, deletedAt: null },
        select: { createdAt: true },
      }),
      this.prisma.pointsRecord.findMany({
        where: { at: { gte: start }, delta: { gt: 0 } },
        select: { at: true, delta: true },
      }),
    ])

    const dayKey = (s: string): string => s.slice(0, 10)
    const membersByDay = countByDay(users.map((u) => u.registeredAt), dayKey)
    const demandsByDay = countByDay(demands.map((d) => d.createdAt), dayKey)
    const eventsByDay = countByDay(events.map((e) => e.createdAt), dayKey)
    const pointsByDay = new Map<string, number>()
    for (const p of points) {
      const k = dayKey(p.at)
      pointsByDay.set(k, (pointsByDay.get(k) ?? 0) + p.delta)
    }

    const result: TrendPointDto[] = []
    for (let i = span - 1; i >= 0; i--) {
      const d = addDays(today, -i)
      result.push({
        date: `${Number(d.slice(5, 7))}-${d.slice(8, 10)}`,
        members: membersByDay.get(d) ?? 0,
        demands: demandsByDay.get(d) ?? 0,
        events: eventsByDay.get(d) ?? 0,
        points: pointsByDay.get(d) ?? 0,
      })
    }
    return result
  }

  private async loadDashboard(): Promise<Record<string, unknown>> {
    const now = formatNow()
    const pendingWhere: Prisma.ApplicationWhereInput = {
      status: 'pending',
      type: { in: ['settle', 'individual', 'cooperation', 'identity'] },
    }

    const [
      totalUsers,
      activeEnterprises,
      runningProjects,
      pendingApplicationsTotal,
      upcomingEventsTotal,
      pendingApplications,
      upcomingEvents,
      todos,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.enterprise.count({ where: { status: 'active' } }),
      this.prisma.project.count({ where: { status: 'running' } }),
      this.prisma.application.count({ where: pendingWhere }),
      this.prisma.communityEvent.count({ where: { status: 'published', endTime: { gte: now } } }),
      this.prisma.application.findMany({
        where: pendingWhere,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      this.prisma.communityEvent.findMany({
        where: { status: 'published', endTime: { gte: now } },
        orderBy: { startTime: 'asc' },
        take: 4,
        include: { enrollments: { orderBy: { id: 'asc' } } },
      }),
      this.getTodos(),
    ])

    return {
      stats: {
        pendingApplications: pendingApplicationsTotal,
        totalUsers,
        activeEnterprises,
        runningProjects,
        upcomingEvents: upcomingEventsTotal,
      },
      todos,
      pendingApplications,
      upcomingEvents: upcomingEvents.map((e) => toEventDto(e, e.enrollments)),
    }
  }

  /* 六域待办计数 */
  private async todoCounts(): Promise<Record<string, number>> {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    const days = config?.leaseExpireRemindDays ?? 15
    const today = formatToday()
    const windowEnd = addDays(today, days)

    const [settle, demand, reservation, showcase, article, lease] = await Promise.all([
      this.prisma.application.count({
        where: { status: 'pending', type: { in: ['settle', 'individual', 'cooperation', 'identity'] } },
      }),
      this.prisma.demand.count({ where: { status: 'pending', deletedAt: null } }),
      this.prisma.spaceReservation.count({ where: { status: 'pending' } }),
      this.prisma.showcaseRequest.count({ where: { status: 'pending' } }),
      this.prisma.article.count({ where: { status: 'pending', deletedAt: null } }),
      /* expiring 派生：active 且非长期租约且 endDate 落在 [today, today+days] */
      this.prisma.lease.count({
        where: { status: 'active', longTerm: false, endDate: { gte: today, lte: windowEnd } },
      }),
    ])
    return { settle, demand, reservation, showcase, article, lease }
  }
}

/** 按日计数（dayKey 取日期前缀） */
function countByDay(values: string[], dayKey: (s: string) => string): Map<string, number> {
  const map = new Map<string, number>()
  for (const v of values) {
    const k = dayKey(v)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}
