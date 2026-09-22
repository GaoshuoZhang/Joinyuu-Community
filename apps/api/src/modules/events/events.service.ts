import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { PointsEngineService } from '../../common/engine/points-engine/points-engine.service'
import { formatNow } from '../../common/utils/time'
import { normalizeScheduledAt } from '../../common/utils/schedule-time'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import type { EventPayloadDto } from './dto/event-payload.dto'
import type { QueryEnrollmentsDto } from './dto/query-enrollments.dto'
import { toEventDto } from './event-dto'
import { NotificationService } from '../../common/notify/notification.service'
import type { RescheduleEventDto } from './dto/reschedule-event.dto'

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
    private readonly notify: NotificationService,
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

  /** 活动报名审核列表（跨活动；keyword 匹配报名人/企业/电话/活动标题与编号） */
  async listEnrollments(query: QueryEnrollmentsDto): Promise<{ list: unknown[]; total: number }> {
    const where: Prisma.EventEnrollmentWhereInput = {}
    if (query.status) where.status = query.status
    if (query.eventId) where.eventId = query.eventId
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { enterprise: { contains: query.keyword, mode: 'insensitive' } },
        { phone: { contains: query.keyword } },
        { eventId: { contains: query.keyword, mode: 'insensitive' } },
        { event: { title: { contains: query.keyword, mode: 'insensitive' } } },
      ]
    }

    const [rows, total] = await Promise.all([
      this.prisma.eventEnrollment.findMany({
        where,
        orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
        include: {
          event: { select: { id: true, title: true, startTime: true, status: true } },
          user: {
            select: {
              identities: {
                orderBy: { id: 'asc' },
                select: {
                  type: true,
                  enterpriseId: true,
                  enterpriseName: true,
                  role: true,
                  title: true,
                  level: true,
                  experience: true,
                },
              },
            },
          },
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.eventEnrollment.count({ where }),
    ])
    return {
      list: rows.map((row) => ({
        eventId: row.eventId,
        eventTitle: row.event.title,
        eventStartTime: row.event.startTime,
        eventStatus: row.event.status,
        userId: row.userId,
        name: row.name,
        enterprise: row.enterprise,
        identities: row.user.identities.map((identity) => ({
          type: identity.type,
          enterpriseId: identity.enterpriseId ?? undefined,
          enterpriseName: identity.enterpriseName ?? undefined,
          role: identity.role ?? undefined,
          title: identity.title,
          level: identity.level ?? undefined,
          experience: identity.experience ?? undefined,
        })),
        phone: row.phone,
        appliedAt: row.appliedAt,
        status: row.status,
        waitlisted: row.waitlisted,
        waitlistOrder: row.waitlistOrder,
        checkedIn: row.checkedIn,
        checkInAt: row.checkInAt,
      })),
      total,
    }
  }

  async findOne(id: string): Promise<unknown> {
    const [event, feedbacks] = await Promise.all([
      this.prisma.communityEvent.findUnique({
        where: { id },
        include: { enrollments: { orderBy: { id: 'asc' } } },
      }),
      this.prisma.eventFeedback.findMany({ where: { eventId: id }, orderBy: { at: 'desc' } }),
    ])
    if (!event) throw new NotFoundException('活动不存在')
    const average = feedbacks.length
      ? Number((feedbacks.reduce((sum, item) => sum + item.rating, 0) / feedbacks.length).toFixed(1))
      : 0
    return {
      ...toEventDto(event, event.enrollments),
      feedbackSummary: {
        average,
        total: feedbacks.length,
        list: feedbacks.map((item) => ({
          userId: item.userId,
          rating: item.rating,
          comment: item.comment,
          at: item.at,
        })),
      },
    }
  }

  async create(payload: EventPayloadDto, operator: string): Promise<unknown> {
    const event = await this.prisma.communityEvent.create({
      data: {
        id: await this.ids.next('EV'),
        createdAt: formatNow(),
        title: payload.title,
        coverUrl: payload.coverUrl?.trim() || null,
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
        venueLat: payload.venueLat ?? null,
        venueLng: payload.venueLng ?? null,
        checkinRadiusM: payload.checkinRadiusM ?? 200,
        checkinOpenMin: payload.checkinOpenMin ?? 30,
        checkinCloseMin: payload.checkinCloseMin ?? 30,
        cancelDeadlineHours: payload.cancelDeadlineHours ?? 24,
        description: sanitizeHtml(payload.description),
        tags: payload.tags,
      },
    })

    await this.audit.record({
      module: '活动管理',
      action: '新增活动',
      target: `${event.id} · ${event.title}`,
      after: { status: event.status },
      operator,
    })

    return toEventDto(event, [])
  }

  async update(id: string, payload: EventPayloadDto, operator: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status === 'scheduled' || event.status === 'ended' || event.status === 'cancelled') {
      throw new ConflictException('仅待发布/已发布的活动可编辑')
    }
    if (
      event.status === 'published' &&
      (payload.startTime !== event.startTime || payload.endTime !== event.endTime)
    ) {
      throw new BadRequestException('已发布活动的开始/结束时间不可直接修改，请走改期接口（改期才有报名者通知）')
    }

    await this.prisma.communityEvent.update({
      where: { id },
      data: {
        title: payload.title,
        coverUrl: payload.coverUrl?.trim() || null,
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
        venueLat: payload.venueLat ?? null,
        venueLng: payload.venueLng ?? null,
        checkinRadiusM: payload.checkinRadiusM ?? 200,
        checkinOpenMin: payload.checkinOpenMin ?? 30,
        checkinCloseMin: payload.checkinCloseMin ?? 30,
        cancelDeadlineHours: payload.cancelDeadlineHours ?? 24,
        visibilityIdentities: payload.visibilityIdentities,
        visibilityLevels: payload.visibilityLevels,
        enrollmentIdentities: payload.enrollmentIdentities,
        enrollmentLevels: payload.enrollmentLevels,
        requireReview: payload.requireReview,
        enrollmentDeadline: payload.enrollmentDeadline ?? null,
      },
    })

    await this.audit.record({
      module: '活动管理',
      action: '编辑活动',
      target: `${event.id} · ${event.title}`,
      before: { status: event.status },
      after: { status: event.status },
      operator,
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
    /* 格式校验 + 归一化 + 必须晚于当前时间（避免非法/过去值被调度任务判定为立即发布） */
    const normalized = normalizeScheduledAt(scheduledAt)

    await this.prisma.communityEvent.update({
      where: { id },
      data: { status: 'scheduled', scheduledAt: normalized },
    })

    await this.audit.record({
      module: '活动管理',
      action: '活动定时发布',
      target: `${event.id} · ${event.title}`,
      detail: `定时时间 ${normalized}`,
      before: { status: event.status },
      after: { status: 'scheduled', scheduledAt: normalized },
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

  /** 显式设置报名开关（幂等）：重放/重复请求不会反向翻转。 */
  async setEnrollment(id: string, enrollmentOpen: boolean, operator: string): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status !== 'published') throw new ConflictException('仅已发布的活动可调整报名')
    if (event.enrollmentOpen === enrollmentOpen) return { code: 0 }

    await this.prisma.communityEvent.update({
      where: { id },
      data: { enrollmentOpen },
    })

    await this.audit.record({
      module: '活动管理',
      action: enrollmentOpen ? '开放报名' : '暂停报名',
      target: `${event.id} · ${event.title}`,
      before: { enrollmentOpen: event.enrollmentOpen },
      after: { enrollmentOpen },
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

    const active = await this.prisma.eventEnrollment.findMany({
      where: { eventId: id, status: { in: ['pending', 'approved', 'waitlisted'] } },
      select: { userId: true },
    })
    await this.prisma.$transaction(async (tx) => {
      await tx.communityEvent.update({
        where: { id },
        data: { status: 'cancelled', enrollmentOpen: false, archivableAt: formatNow() },
      })
      await tx.eventEnrollment.updateMany({
        where: { eventId: id, status: { in: ['pending', 'approved', 'waitlisted'] } },
        data: { status: 'cancelled', waitlisted: false, waitlistOrder: null },
      })
      for (const enrollment of active) {
        await this.notify.pushNoticeInTransaction(tx, enrollment.userId, {
          type: 'event',
          title: '活动已取消',
          content: `「${event.title}」已取消，报名状态已同步更新。`,
          link: '/me/enrollments',
        })
      }
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

  async reschedule(id: string, dto: RescheduleEventDto, operator: string): Promise<{ notified: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status !== 'published') throw new ConflictException('仅已发布活动可改期')
    if (dto.startTime >= dto.endTime) throw new ConflictException('结束时间需晚于开始时间')

    const active = await this.prisma.eventEnrollment.findMany({
      where: { eventId: id, status: { in: ['pending', 'approved', 'waitlisted'] } },
      select: { userId: true },
    })
    await this.prisma.$transaction(async (tx) => {
      await tx.communityEvent.update({
        where: { id },
        data: { startTime: dto.startTime, endTime: dto.endTime, rescheduledTo: dto.startTime },
      })
      for (const enrollment of active) {
        await this.notify.pushNoticeInTransaction(tx, enrollment.userId, {
          type: 'event',
          title: '活动时间已调整',
          content: `「${event.title}」改期至 ${dto.startTime}，原因：${dto.reason.trim()}。请留意行程。`,
          link: '/me/enrollments',
        })
      }
    })
    await this.audit.record({
      module: '活动管理',
      action: '活动改期',
      target: `${event.id} · ${event.title}`,
      detail: dto.reason.trim(),
      before: { startTime: event.startTime, endTime: event.endTime },
      after: { startTime: dto.startTime, endTime: dto.endTime },
      operator,
    })
    return { notified: active.length }
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
    operator: string,
    reason?: string,
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

    /* 与报名审核串行化：同一活动的并发通过请求不会越过容量上限；
     * 状态迁移 + 容量校验 + 积分发放同事务，任一失败整体回滚。 */
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'event-enroll:' + eventId}))`

      /* 条件更新做幂等守卫：并发/重复调用只会命中一次状态迁移 */
      const updated = await tx.eventEnrollment.updateMany({
        where: { eventId, userId, status: 'pending' },
        data: { status },
      })
      if (updated.count === 0) throw new ConflictException('该报名已审核，请勿重复操作')

      if (status === 'approved') {
        /* 容量校验：capacity <= 0 视为不限名额；含本次在内已通过数超过容量则拒绝 */
        if (event.capacity > 0) {
          const approvedCount = await tx.eventEnrollment.count({ where: { eventId, status: 'approved' } })
          if (approvedCount > event.capacity) throw new ConflictException('活动名额已满，无法通过该报名')
        }
        /* 报名积分 = enrollPoints ?? 规则值；custom 值直写事务（引擎仅读规则值，此处内联其事务模式） */
        if (event.enrollPoints != null) {
          await this.issuePointsByValueInTransaction(tx, userId, event.enrollPoints, ENROLL_APPROVED_POINTS_REASON)
        } else {
          await this.engine.issuePointsInTransaction(tx, userId, 'activity_enroll_approved', ENROLL_APPROVED_POINTS_REASON)
        }
      }
    })

    await this.notify.pushNotice(userId, {
      type: 'event',
      title: status === 'approved' ? '活动报名已通过' : '活动报名未通过',
      content:
        status === 'approved'
          ? `「${event.title}」报名已通过，请准时参加。`
          : `「${event.title}」报名未通过审核：${reason ?? ''}`,
      link: '/me/enrollments',
    })

    await this.audit.record({
      module: '活动管理',
      action: status === 'approved' ? '报名审核通过' : '报名审核驳回',
      target: `${event.id} · ${enrollment.name}`,
      before: { status: 'pending' },
      after: status === 'rejected' ? { status, reason: reason ?? '' } : { status },
      operator,
    })
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
        data: { checkedIn: true, checkInAt: formatNow(), checkinMethod: 'admin' },
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

  async listTickets(eventId: string) {
    const event = await this.prisma.communityEvent.findUnique({ where: { id: eventId }, select: { id: true } })
    if (!event) throw new NotFoundException('活动不存在')
    const tickets = await this.prisma.eventTicket.findMany({ where: { eventId }, orderBy: { id: 'asc' } })
    const enrollments = await this.prisma.eventEnrollment.findMany({
      where: { id: { in: tickets.map((ticket) => ticket.enrollmentId) } },
      select: { id: true, userId: true, name: true },
    })
    const byId = new Map(enrollments.map((item) => [item.id, item]))
    return tickets.map((ticket) => ({
      ticketNo: ticket.ticketNo,
      redeemCode: ticket.redeemCode,
      userId: byId.get(ticket.enrollmentId)?.userId ?? '',
      userName: byId.get(ticket.enrollmentId)?.name ?? '',
      redeemedAt: ticket.redeemedAt ?? undefined,
    }))
  }

  async redeemTicket(eventId: string, rawCode: string): Promise<{ code: number }> {
    const redeemCode = rawCode.trim().toUpperCase()
    const ticket = await this.prisma.eventTicket.findFirst({ where: { eventId, redeemCode } })
    if (!ticket) throw new NotFoundException('电子票核销码无效')
    if (ticket.redeemedAt) throw new ConflictException('该电子票已核销')
    const enrollment = await this.prisma.eventEnrollment.findUnique({ where: { id: ticket.enrollmentId } })
    if (!enrollment || enrollment.status !== 'approved') throw new ConflictException('该电子票对应报名不可核销')
    if (!enrollment.checkedIn) await this.checkin(eventId, enrollment.userId)
    const updated = await this.prisma.eventTicket.updateMany({
      where: { id: ticket.id, redeemedAt: null },
      data: { redeemedAt: formatNow() },
    })
    if (updated.count !== 1) throw new ConflictException('该电子票已核销')
    return { code: 0 }
  }

  /* 自定义积分值发放（独立事务）—— 供签到等单步流程使用 */
  private async issuePointsByValue(userId: string, value: number, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.issuePointsByValueInTransaction(tx, userId, value, reason)
    })
  }

  /* 自定义积分值发放 —— 在调用方事务内原子自增余额并写流水（与 PointsEngineService 同口径，
   * 并发下不再「读旧值→写绝对值」丢积分） */
  private async issuePointsByValueInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    value: number,
    reason: string,
  ): Promise<void> {
    const exists = await tx.user.findUnique({ where: { uid: userId }, select: { uid: true } })
    if (!exists) return
    const user = await tx.user.update({ where: { uid: userId }, data: { points: { increment: value } } })
    await tx.pointsRecord.create({
      data: {
        id: await this.ids.next('PT'),
        userId,
        delta: value,
        balance: user.points,
        reason,
        at: formatNow(),
        operator: '系统',
        source: 'rule',
      },
    })
  }

}
