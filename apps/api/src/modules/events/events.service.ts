import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { PointsEngineService } from '../../common/engine/points-engine/points-engine.service'
import { formatNow } from '../../common/utils/time'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import type { EventPayloadDto } from './dto/event-payload.dto'
import { toEventDto } from './event-dto'

/* 活动模块（wiki-backend.md §7.8/§8.1/§8.4）：
 * 状态机 pending_release →(publish-now|schedule)→ published|scheduled →(到点定时任务)→ published
 * published →(endTime 到点定时任务)→ ended；pending_release/published →(cancel)→ cancelled；cancelled →(restore)→ pending_release。
 * 报名审核通过/签到触发积分/经验值发放（custom 值直写事务，缺省走 PointsEngineService 规则值）。 */

/* 触发项积分/经验值流水 reason —— 沿用规则流水文案风格（如「活动签到积分」） */
const ENROLL_APPROVED_POINTS_REASON = '活动报名奖励'
const CHECKIN_POINTS_REASON = '活动签到积分'
const CHECKIN_EXP_REASON = '活动签到经验值'

interface EventQuery {
  page: number
  pageSize: number
  keyword?: string
  type?: string
  status?: string
  participant?: string
  sortBy?: 'id' | 'startTime' | 'createdAt'
  sortOrder?: 'ascend' | 'descend'
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly engine: PointsEngineService,
  ) {}

  async findAll(query: EventQuery): Promise<{ list: unknown[]; total: number }> {
    const where: Prisma.CommunityEventWhereInput = { deletedAt: null }
    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword, mode: 'insensitive' } },
        { id: { contains: query.keyword, mode: 'insensitive' } },
      ]
    }
    if (query.type) where.type = query.type
    if (query.status) where.status = query.status
    if (query.participant) {
      where.enrollments = { some: { userId: query.participant } }
    }

    const dir: Prisma.SortOrder = query.sortOrder === 'ascend' ? 'asc' : 'desc'
    let orderBy: Prisma.CommunityEventOrderByWithRelationInput
    if (query.sortBy === 'startTime') orderBy = { startTime: dir }
    else if (query.sortBy === 'createdAt') orderBy = { createdAt: dir }
    else orderBy = { id: dir }

    const [list, total] = await Promise.all([
      this.prisma.communityEvent.findMany({
        where,
        orderBy,
        include: { enrollments: { orderBy: { id: 'asc' } } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.communityEvent.count({ where }),
    ])
    return { list: list.map((e) => toEventDto(e, e.enrollments)), total }
  }

  async findOne(id: string): Promise<unknown> {
    const event = await this.prisma.communityEvent.findUnique({
      where: { id },
      include: { enrollments: { orderBy: { id: 'asc' } } },
    })
    if (!event) throw new NotFoundException('活动不存在')
    return toEventDto(event, event.enrollments)
  }

  async create(payload: EventPayloadDto): Promise<unknown> {
    const event = await this.prisma.communityEvent.create({
      data: {
        id: await this.ids.next('EV'),
        createdAt: formatNow(),
        title: payload.title,
        type: payload.type,
        startTime: payload.startTime,
        endTime: payload.endTime,
        location: payload.location,
        capacity: payload.capacity,
        speaker: payload.speaker,
        host: payload.host,
        status: 'pending_release',
        enrollmentOpen: false,
        visibilityIdentities: payload.visibilityIdentities,
        visibilityLevels: payload.visibilityLevels,
        enrollmentIdentities: payload.enrollmentIdentities,
        enrollmentLevels: payload.enrollmentLevels,
        requireReview: payload.requireReview,
        enrollmentDeadline: payload.enrollmentDeadline ?? null,
        scheduledAt: null,
        enrollPoints: payload.enrollPoints ?? null,
        checkinPoints: payload.checkinPoints ?? null,
        description: sanitizeHtml(payload.description),
        tags: payload.tags,
      },
    })
    return toEventDto(event, [])
  }

  async update(id: string, payload: EventPayloadDto): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status === 'scheduled' || event.status === 'ended' || event.status === 'cancelled') {
      throw new ConflictException('仅待发布/已发布的活动可编辑')
    }

    await this.prisma.communityEvent.update({
      where: { id },
      data: {
        title: payload.title,
        type: payload.type,
        startTime: payload.startTime,
        endTime: payload.endTime,
        location: payload.location,
        capacity: payload.capacity,
        speaker: payload.speaker,
        host: payload.host,
        description: sanitizeHtml(payload.description),
        tags: payload.tags,
        enrollPoints: payload.enrollPoints ?? null,
        checkinPoints: payload.checkinPoints ?? null,
        visibilityIdentities: payload.visibilityIdentities,
        visibilityLevels: payload.visibilityLevels,
        enrollmentIdentities: payload.enrollmentIdentities,
        enrollmentLevels: payload.enrollmentLevels,
        requireReview: payload.requireReview,
        enrollmentDeadline: payload.enrollmentDeadline ?? null,
      },
    })
    return { code: 0 }
  }

  async publishNow(id: string, operator: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status !== 'pending_release') throw new ConflictException('仅待发布的活动可立即发布')

    await this.prisma.communityEvent.update({
      where: { id },
      data: { status: 'published', enrollmentOpen: true },
    })

    await this.audit.record({
      module: '活动管理',
      action: '活动发布',
      target: `${event.id} · ${event.title}`,
      before: { status: event.status },
      after: { status: 'published', enrollmentOpen: true },
      operator,
    })
    return { code: 0 }
  }

  async schedule(id: string, scheduledAt: string, operator: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status !== 'pending_release') throw new ConflictException('仅待发布的活动可设定时发布')

    await this.prisma.communityEvent.update({
      where: { id },
      data: { status: 'scheduled', scheduledAt },
    })

    await this.audit.record({
      module: '活动管理',
      action: '活动定时发布',
      target: `${event.id} · ${event.title}`,
      detail: `定时时间 ${scheduledAt}`,
      before: { status: event.status },
      after: { status: 'scheduled', scheduledAt },
      operator,
    })
    return { code: 0 }
  }

  async cancelSchedule(id: string, operator: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status !== 'scheduled') throw new ConflictException('仅定时发布中的活动可取消定时')

    await this.prisma.communityEvent.update({
      where: { id },
      data: { status: 'pending_release', scheduledAt: null },
    })

    await this.audit.record({
      module: '活动管理',
      action: '取消定时发布',
      target: `${event.id} · ${event.title}`,
      before: { status: event.status },
      after: { status: 'pending_release' },
      operator,
    })
    return { code: 0 }
  }

  async toggleEnrollment(id: string, operator: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status !== 'published') throw new ConflictException('仅已发布的活动可调整报名')

    await this.prisma.communityEvent.update({
      where: { id },
      data: { enrollmentOpen: !event.enrollmentOpen },
    })

    await this.audit.record({
      module: '活动管理',
      action: event.enrollmentOpen ? '暂停报名' : '开放报名',
      target: `${event.id} · ${event.title}`,
      before: { enrollmentOpen: event.enrollmentOpen },
      after: { enrollmentOpen: !event.enrollmentOpen },
      operator,
    })
    return { code: 0 }
  }

  async cancel(id: string, operator: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status !== 'pending_release' && event.status !== 'published') {
      throw new ConflictException('该状态下不可取消活动')
    }

    await this.prisma.communityEvent.update({
      where: { id },
      data: { status: 'cancelled', archivableAt: formatNow() },
    })

    await this.audit.record({
      module: '活动管理',
      action: '活动取消',
      target: `${event.id} · ${event.title}`,
      before: { status: event.status },
      after: { status: 'cancelled' },
      operator,
    })
    return { code: 0 }
  }

  async restore(id: string, operator: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status !== 'cancelled') throw new ConflictException('仅已取消的活动可转为待发布')

    await this.prisma.communityEvent.update({
      where: { id },
      data: { status: 'pending_release' },
    })

    await this.audit.record({
      module: '活动管理',
      action: '恢复活动',
      target: `${event.id} · ${event.title}`,
      before: { status: event.status },
      after: { status: 'pending_release' },
      operator,
    })
    return { code: 0 }
  }

  async archive(id: string, operator: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findFirst({ where: { id, deletedAt: null } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status !== 'ended' && event.status !== 'cancelled') {
      throw new ConflictException('仅已结束或已取消的活动可归档')
    }

    await this.prisma.communityEvent.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '活动管理',
      action: '归档活动',
      target: `${event.id} · ${event.title}`,
      before: { status: event.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }

  async reviewEnrollment(
    eventId: string,
    userId: string,
    status: 'approved' | 'rejected',
  ): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id: eventId } })
    if (!event) throw new NotFoundException('活动不存在')
    const enrollment = await this.prisma.eventEnrollment.findUnique({
      where: { eventId_userId: { eventId, userId } },
    })
    if (!enrollment) throw new NotFoundException('报名记录不存在')
    if (enrollment.status !== 'pending') {
      throw new ConflictException('该报名已审核，请勿重复操作')
    }

    /* 条件更新做幂等守卫：并发/重复调用只会命中一次状态迁移 */
    const updated = await this.prisma.eventEnrollment.updateMany({
      where: { eventId, userId, status: 'pending' },
      data: { status },
    })
    if (updated.count === 0) throw new ConflictException('该报名已审核，请勿重复操作')

    if (status === 'approved') {
      /* 报名积分 = enrollPoints ?? 规则值；custom 值直写事务（引擎仅读规则值，此处内联其事务模式） */
      if (event.enrollPoints != null) {
        await this.issuePointsByValue(userId, event.enrollPoints, ENROLL_APPROVED_POINTS_REASON)
      } else {
        await this.engine.issuePoints(userId, 'activity_enroll_approved', ENROLL_APPROVED_POINTS_REASON)
      }
    }
    return { code: 0 }
  }

  async checkin(eventId: string, userId: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id: eventId } })
    if (!event) throw new NotFoundException('活动不存在')
    const enrollment = await this.prisma.eventEnrollment.findUnique({
      where: { eventId_userId: { eventId, userId } },
    })
    if (!enrollment) throw new NotFoundException('报名记录不存在')

    if (!enrollment.checkedIn) {
      /* 条件更新防并发重复签到与重复发奖 */
      const updated = await this.prisma.eventEnrollment.updateMany({
        where: { eventId, userId, checkedIn: false },
        data: { checkedIn: true, checkInAt: formatNow() },
      })
      if (updated.count === 0) throw new ConflictException('该报名已签到，请勿重复操作')

      /* 签到积分 = checkinPoints ?? 规则值 */
      if (event.checkinPoints != null) {
        await this.issuePointsByValue(userId, event.checkinPoints, CHECKIN_POINTS_REASON)
      } else {
        await this.engine.issuePoints(userId, 'activity_checkin', CHECKIN_POINTS_REASON)
      }
      /* 签到经验值：归属社区个体身份（引擎内按 LevelTier 重算 level） */
      await this.engine.issueExperience('individual', userId, 'activity_checkin', CHECKIN_EXP_REASON)
    }
    return { code: 0 }
  }

  /* 自定义积分值发放 —— 复刻 PointsEngineService.issuePoints 的事务模式（余额 += 值 + 写 source=rule 流水） */
  private async issuePointsByValue(userId: string, value: number, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { uid: userId } })
      if (!user) return
      const balance = user.points + value
      await tx.user.update({ where: { uid: userId }, data: { points: balance } })
      await tx.pointsRecord.create({
        data: {
          id: await this.ids.next('PT'),
          userId,
          delta: value,
          balance,
          reason,
          at: formatNow(),
          operator: '系统',
          source: 'rule',
        },
      })
    })
  }

}
