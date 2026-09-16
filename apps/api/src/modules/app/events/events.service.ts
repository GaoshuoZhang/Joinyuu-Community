import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { createHmac } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import { Prisma, type CommunityEvent, type EventEnrollment, type UserIdentity } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { PointsEngineService } from '../../../common/engine/points-engine/points-engine.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { formatNow } from '../../../common/utils/time'
import { assertRealnameAllowed } from '../realname/realname.service'
import { CheckInDto } from './dto/check-in.dto'
import { SubmitFeedbackDto } from './dto/submit-feedback.dto'

/* 积分/经验触发 reason 文案（与 admin events 流水风格一致） */
const ENROLL_APPROVED_REASON = '活动报名奖励'
const CHECKIN_REASON = '活动签到'

/* 电子票核销码 HMAC 密钥：复用 JWT 密钥；未配置时降级开发默认值（与 JwtModule 兜底一致） */
const TICKET_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me'

/* 活动中心（M2-R R2，/api/app/events + /api/app/me/enrollments）：
 * 浏览（published 未结束 + 身份×等级可见范围）、详情（进度/我的报名态/改期提示）、
 * 报名（截止/范围/容量 → 满员候补、requireReview→pending）、取消（释放名额自动递补候补第一名）、
 * 客户端电子签到（时间窗 + 有地址时地理围栏 + 防重复 + activity_checkin 积分 + 签到即核销 Q4）、
 * 我的报名、电子票（approved 懒签发 + HMAC 核销码）、活动反馈（结束后 + 参与过 + 一人一条）。 */
@Injectable()
export class AppEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly engine: PointsEngineService,
    private readonly notify: NotificationService,
    private readonly jwt: JwtService,
  ) {}

  /* ---------- 活动浏览 ---------- */

  async list(authorization: string | undefined, page: number, pageSize: number, type?: string, keyword?: string) {
    const uid = await this.optionalUid(authorization)
    const identities = await this.loadIdentities(uid)
    const kw = keyword?.trim().toLowerCase()

    const all = await this.prisma.communityEvent.findMany({
      where: { status: 'published', deletedAt: null },
      include: { enrollments: true },
    })
    const open = all.filter((e) => e.endTime > formatNow())
    /* 类型 + 关键词（标题/地点/嘉宾）过滤 */
    const filtered = open.filter((e) => {
      if (type && e.type !== type) return false
      if (kw) {
        if (!e.title.toLowerCase().includes(kw) && !e.location.toLowerCase().includes(kw) && !e.speaker.toLowerCase().includes(kw)) {
          return false
        }
      }
      return true
    })
    /* 可见范围：身份 × 等级交集（空数组 = 不限） */
    const visible = filtered.filter((e) => this.scopeMatches(e.visibilityIdentities, e.visibilityLevels, identities))

    // 当前页的我的报名态
    const pageRows = visible.slice((page - 1) * pageSize, page * pageSize)
    const mine = await this.prisma.eventEnrollment.findMany({
      where: { userId: uid, eventId: { in: pageRows.map((e) => e.id) } },
    })
    const mineMap = new Map(mine.map((m) => [m.eventId, m]))

    return {
      list: pageRows.map((e) => this.toEventDto(e, mineMap.get(e.id))),
      total: visible.length,
    }
  }

  async detail(authorization: string | undefined, id: string) {
    const uid = await this.optionalUid(authorization)
    const event = await this.prisma.communityEvent.findUnique({
      where: { id },
      include: { enrollments: true },
    })
    if (!event || event.deletedAt || event.status === 'cancelled') throw new NotFoundException('活动不存在')

    const identities = await this.loadIdentities(uid)
    if (!this.scopeMatches(event.visibilityIdentities, event.visibilityLevels, identities)) {
      throw new NotFoundException('活动不存在')
    }

    const mine = await this.prisma.eventEnrollment.findUnique({
      where: { eventId_userId: { eventId: id, userId: uid } },
    })
    return this.toEventDto(event, mine ?? undefined)
  }

  /* ---------- 报名 / 取消 ---------- */

  async enroll(uid: string, eventId: string): Promise<{ status: 'approved' | 'pending' | 'waitlisted'; waitlistOrder?: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid }, include: { identities: true } })
    if (!user) throw new NotFoundException('用户不存在')
    const event = await this.requireEnrollableEvent(eventId, uid)
    if (event.enrollmentOpen === false) throw new BadRequestException('报名暂未开放')
    const now = formatNow()
    if (event.enrollmentDeadline && now > event.enrollmentDeadline) throw new BadRequestException('报名已截止')

    // 实名强制校验（M2-R R3 分级权益）：开关开启且未实名时禁止报名
    await assertRealnameAllowed(this.prisma, uid, 'enroll')

    // 可报名范围过滤
    if (!this.scopeMatches(event.enrollmentIdentities, event.enrollmentLevels, user.identities)) {
      throw new BadRequestException('您暂不符合该活动的报名条件')
    }

    const name = user.realName || user.nickname
    const enterpriseIdentity = user.identities.find(
      (i) => i.type === 'community_enterprise' || i.type === 'external_enterprise',
    )
    const enterprise = enterpriseIdentity?.enterpriseName ?? ''

    const base = {
      eventId,
      userId: uid,
      name,
      enterprise,
      phone: user.phone,
      appliedAt: now,
    }

    return this.prisma.$transaction(async (tx) => {
      // 同一活动报名串行化，避免并发请求突破 capacity 或产生重复候补序号。
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-enroll:${eventId}`}))`
      const existing = await tx.eventEnrollment.findUnique({
        where: { eventId_userId: { eventId, userId: uid } },
      })
      if (existing && existing.status !== 'cancelled' && existing.status !== 'rejected') {
        throw new ConflictException('您已报名该活动')
      }

      const approvedCount = await tx.eventEnrollment.count({ where: { eventId, status: 'approved' } })
      let result: { status: 'approved' | 'pending' | 'waitlisted'; waitlistOrder?: number }
      if (approvedCount >= event.capacity) {
        const waitlistCount = await tx.eventEnrollment.count({
          where: { eventId, status: 'waitlisted', waitlisted: true },
        })
        result = { status: 'waitlisted', waitlistOrder: waitlistCount + 1 }
      } else if (event.requireReview) {
        result = { status: 'pending' }
      } else {
        result = { status: 'approved' }
      }

      const enrollmentData = {
        ...base,
        status: result.status,
        waitlisted: result.status === 'waitlisted',
        waitlistOrder: result.waitlistOrder ?? null,
        checkedIn: false,
        checkInAt: null,
        checkinLat: null,
        checkinLng: null,
        checkinMethod: null,
      }
      if (existing) {
        await tx.eventEnrollment.update({ where: { id: existing.id }, data: enrollmentData })
      } else {
        await tx.eventEnrollment.create({ data: enrollmentData })
      }
      if (result.status === 'approved') {
        await this.engine.issuePointsInTransaction(
          tx,
          uid,
          'activity_enroll_approved',
          ENROLL_APPROVED_REASON,
          `enroll:${uid}:${eventId}`,
        )
      }
      return result
    })
  }

  async cancel(uid: string, eventId: string): Promise<{ code: number }> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-enroll:${eventId}`}))`
      const enrollment = await tx.eventEnrollment.findUnique({
        where: { eventId_userId: { eventId, userId: uid } },
        include: { event: true },
      })
      if (!enrollment) throw new NotFoundException('报名记录不存在')
      if (enrollment.status === 'cancelled') throw new ConflictException('该报名已取消')
      if (enrollment.status !== 'pending' && enrollment.status !== 'approved') {
        throw new ConflictException('该状态不可取消报名')
      }

      const cancelHours = enrollment.event.cancelDeadlineHours ?? 24
      if (enrollment.status === 'approved') {
        const cutoff = this.parseTime(enrollment.event.startTime).getTime() - cancelHours * 3600_000
        if (Date.now() >= cutoff) throw new ConflictException(`活动开场前 ${cancelHours} 小时不可取消`)
      }
      await tx.eventEnrollment.update({ where: { id: enrollment.id }, data: { status: 'cancelled' } })
      if (enrollment.status === 'approved') await this.promoteWaitlist(tx, enrollment.event)
      await this.notify.pushNoticeInTransaction(tx, uid, {
        type: 'event',
        title: '报名已取消',
        content: `您已取消活动「${enrollment.event.title}」的报名。`,
      })
    })
    return { code: 0 }
  }

  /* ---------- 电子签到 ---------- */

  async checkIn(uid: string, eventId: string, dto: CheckInDto): Promise<{ pointsAwarded: number }> {
    const event = await this.prisma.communityEvent.findUnique({
      where: { id: eventId },
      include: { enrollments: { where: { userId: uid } } },
    })
    if (!event || event.deletedAt || event.status === 'cancelled') throw new NotFoundException('活动不存在')
    const enrollment = event.enrollments[0]
    if (!enrollment || enrollment.status !== 'approved') throw new BadRequestException('您未报名或报名未通过')
    if (enrollment.checkedIn) throw new ConflictException('您已签到')

    // 时间窗：checkinOpenMin/checkinCloseMin ± startTime
    const nowTs = Date.now()
    const startTs = this.parseTime(event.startTime).getTime()
    const openMin = event.checkinOpenMin ?? 30
    const closeMin = event.checkinCloseMin ?? 30
    if (nowTs < startTs - openMin * 60_000 || nowTs > startTs + closeMin * 60_000) {
      throw new BadRequestException('当前不在签到时间范围内')
    }

    // 地理围栏：配置了签到地点时校验距离 <= checkinRadiusM
    if (event.venueLat != null && event.venueLng != null) {
      const radius = event.checkinRadiusM ?? 200
      const dist = haversineMeters(
        Number(event.venueLng),
        Number(event.venueLat),
        Number(dto.lng),
        Number(dto.lat),
      )
      if (dist > radius) throw new BadRequestException('您不在活动签到范围内')
    }

    /* 签到积分 = checkinPoints ?? 规则值 */
    const rule = await this.prisma.pointsRule.findUnique({
      where: { code: 'activity_checkin' },
      select: { points: true },
    })
    const awarded = event.checkinPoints ?? rule?.points ?? 0
    const now = formatNow()
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventEnrollment.updateMany({
        where: { id: enrollment.id, checkedIn: false },
        data: {
          checkedIn: true,
          checkInAt: now,
          checkinLat: String(dto.lat),
          checkinLng: String(dto.lng),
          checkinMethod: 'self',
        },
      })
      if (updated.count !== 1) throw new ConflictException('您已签到')
      if (awarded > 0) {
        await this.engine.issueFixedPointsInTransaction(tx, uid, awarded, CHECKIN_REASON, `checkin:${uid}:${eventId}`)
      }
      /* 签到即核销（Q4）：该报名有电子票则标记已核销 */
      await tx.eventTicket.updateMany({
        where: { enrollmentId: enrollment.id, redeemedAt: null },
        data: { redeemedAt: now },
      })
    })

    return { pointsAwarded: awarded }
  }

  /* ---------- 我的报名 / 电子票 ---------- */

  async myEnrollments(uid: string) {
    const rows = await this.prisma.eventEnrollment.findMany({
      where: { userId: uid },
      include: { event: true },
      orderBy: { id: 'desc' },
    })
    return {
      list: rows.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        eventTitle: r.event.title,
        startTime: r.event.startTime,
        location: r.event.location,
        status: r.status,
        checkedIn: r.checkedIn,
        waitlistOrder: r.waitlistOrder ?? undefined,
        eventStatus: r.event.status,
        rescheduledTo: r.event.rescheduledTo ?? undefined,
      })),
      total: rows.length,
    }
  }

  async myTicket(uid: string, enrollmentId: string) {
    const enrollment = await this.prisma.eventEnrollment.findUnique({
      where: { id: Number(enrollmentId) },
      include: { event: true },
    })
    if (!enrollment) throw new NotFoundException('报名记录不存在')
    if (enrollment.userId !== uid) throw new ForbiddenException('无权查看该电子票')
    if (enrollment.status !== 'approved') throw new BadRequestException('报名未通过，无法获取电子票')
    if (enrollment.event.status === 'cancelled') throw new BadRequestException('活动已取消，无法获取电子票')

    let ticket = await this.prisma.eventTicket.findUnique({
      where: { enrollmentId: enrollment.id },
    })
    if (!ticket) {
      const ticketNo = `ET${enrollment.eventId.replace(/^EV/, '')}${enrollment.id}`
      const redeemCode = createHmac('sha256', TICKET_SECRET)
        .update(`${enrollment.eventId}:${enrollment.id}`)
        .digest('hex')
        .slice(0, 8)
        .toUpperCase()
      try {
        ticket = await this.prisma.eventTicket.create({
          data: { eventId: enrollment.eventId, enrollmentId: enrollment.id, ticketNo, redeemCode },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          ticket = await this.prisma.eventTicket.findUnique({ where: { enrollmentId: enrollment.id } })
        } else {
          throw error
        }
      }
    }
    if (!ticket) throw new NotFoundException('电子票生成失败')

    return {
      ticketNo: ticket.ticketNo,
      redeemCode: ticket.redeemCode,
      redeemedAt: ticket.redeemedAt ?? undefined,
      event: {
        id: enrollment.event.id,
        title: enrollment.event.title,
        startTime: enrollment.event.startTime,
        location: enrollment.event.location,
      },
    }
  }

  /** 按活动 id 获取当前用户电子票，适配移动端 `/events/:id/ticket` 路由。 */
  async myTicketByEvent(uid: string, eventId: string) {
    const enrollment = await this.prisma.eventEnrollment.findUnique({
      where: { eventId_userId: { eventId, userId: uid } },
      include: { event: true },
    })
    if (!enrollment) throw new NotFoundException('报名记录不存在')
    const ticket = await this.myTicket(uid, String(enrollment.id))
    return {
      eventId,
      eventTitle: enrollment.event.title,
      startTime: enrollment.event.startTime,
      location: enrollment.event.location,
      ticketCode: ticket.redeemCode,
      status: enrollment.event.status === 'cancelled' ? 'cancelled' : ticket.redeemedAt ? 'checked' : 'valid',
      checkedIn: enrollment.checkedIn,
      waitlistOrder: enrollment.waitlistOrder ?? undefined,
    }
  }

  /* ---------- 活动反馈 ---------- */

  async getMyFeedback(uid: string, eventId: string) {
    const fb = await this.prisma.eventFeedback.findUnique({
      where: { eventId_userId: { eventId, userId: uid } },
    })
    if (!fb) return null
    return { eventId: fb.eventId, rating: fb.rating, comment: fb.comment || undefined, at: fb.at }
  }

  async submitFeedback(uid: string, eventId: string, dto: SubmitFeedbackDto): Promise<{ code: number }> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id: eventId } })
    if (!event) throw new NotFoundException('活动不存在')
    if (event.status === 'cancelled') throw new BadRequestException('活动已取消，无法评价')
    if (event.endTime >= formatNow()) throw new BadRequestException('活动尚未结束，暂不能评价')

    const participated = await this.prisma.eventEnrollment.findFirst({
      where: { eventId, userId: uid, status: 'approved' },
      select: { id: true },
    })
    if (!participated) throw new BadRequestException('您未参与该活动，无法评价')

    const existing = await this.prisma.eventFeedback.findUnique({
      where: { eventId_userId: { eventId, userId: uid } },
    })
    if (existing) throw new ConflictException('您已评价该活动')

    try {
      await this.prisma.eventFeedback.create({
        data: { eventId, userId: uid, rating: dto.rating, comment: dto.comment ?? '', at: formatNow() },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('您已评价该活动')
      }
      throw error
    }
    return { code: 0 }
  }

  /* ---------- 内部工具 ---------- */

  /** 取用户身份集（type + level），供可见/报名范围过滤 */
  private async loadIdentities(uid: string): Promise<Pick<UserIdentity, 'type' | 'level'>[]> {
    const rows = await this.prisma.userIdentity.findMany({
      where: { userId: uid },
      select: { type: true, level: true },
    })
    return rows
  }

  /** 范围过滤：身份类型集合与等级集合各自对用户身份取交集；空数组 = 不限 */
  private scopeMatches(
    identityTypes: string[],
    levels: string[],
    identities: Array<{ type: string; level: number | null }>,
  ): boolean {
    const identOk = identityTypes.length === 0 || identities.some((i) => identityTypes.includes(i.type))
    const levelOk =
      levels.length === 0 || identities.some((i) => i.level != null && levels.includes(String(i.level)))
    return identOk && levelOk
  }

  /** 取可报名活动（存在 + 可见范围 + 未取消），否则 404 */
  private async requireEnrollableEvent(eventId: string, uid: string): Promise<CommunityEvent> {
    const event = await this.prisma.communityEvent.findUnique({ where: { id: eventId } })
    if (!event || event.deletedAt || event.status !== 'published') throw new NotFoundException('活动不存在')
    const identities = await this.loadIdentities(uid)
    if (!this.scopeMatches(event.visibilityIdentities, event.visibilityLevels, identities)) {
      throw new NotFoundException('活动不存在')
    }
    return event
  }

  /** 靠前候补递补第一名（已通过者取消后释放名额） */
  private async promoteWaitlist(tx: Prisma.TransactionClient, event: CommunityEvent): Promise<void> {
    const candidate = await tx.eventEnrollment.findFirst({
      where: { eventId: event.id, status: 'waitlisted', waitlisted: true },
      orderBy: { waitlistOrder: 'asc' },
    })
    if (!candidate) return
    await tx.eventEnrollment.update({
      where: { id: candidate.id },
      data: { status: 'approved', waitlisted: false, waitlistOrder: null },
    })
    await this.engine.issuePointsInTransaction(
      tx,
      candidate.userId,
      'activity_enroll_approved',
      ENROLL_APPROVED_REASON,
      `enroll:${candidate.userId}:${event.id}`,
    )
    await this.notify.pushNoticeInTransaction(tx, candidate.userId, {
      type: 'event',
      title: '报名递补成功',
      content: `您报名的活动「${event.title}」已有名额释放，已自动递补成功，请留意活动安排。`,
    })
  }

  /** 活动转出（列表/详情统一）。myEnrollment 可选，null 表示未报名 */
  private toEventDto(
    e: CommunityEvent & { enrollments?: EventEnrollment[] },
    mine?: EventEnrollment | null,
  ) {
    const enrollments = e.enrollments ?? []
    const approvedCount = enrollments.filter((x) => x.status === 'approved').length
    return {
      id: e.id,
      title: e.title,
      type: e.type,
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      capacity: e.capacity,
      approvedCount,
      requireReview: e.requireReview,
      enrollmentDeadline: e.enrollmentDeadline ?? '',
      status: e.status,
      visibilityIdentities: e.visibilityIdentities,
      visibilityLevels: e.visibilityLevels,
      enrollmentIdentities: e.enrollmentIdentities,
      enrollmentLevels: e.enrollmentLevels,
      description: e.description,
      tags: e.tags,
      venueLat: this.numOrUndef(e.venueLat),
      venueLng: this.numOrUndef(e.venueLng),
      checkinRadiusM: e.checkinRadiusM ?? 200,
      checkinOpenMin: e.checkinOpenMin ?? 30,
      checkinCloseMin: e.checkinCloseMin ?? 30,
      rescheduledTo: e.rescheduledTo ?? undefined,
      myEnrollmentStatus: mine?.status,
      myCheckedIn: mine?.checkedIn ?? false,
      myWaitlistOrder: mine?.waitlistOrder ?? undefined,
    }
  }

  private numOrUndef(v: string | null): number | undefined {
    if (v == null || v === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  private parseTime(s: string): Date {
    return new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}`)
  }

  /** Public 浏览端点的可选 app JWT；无效令牌按游客处理。 */
  private async optionalUid(authorization?: string): Promise<string> {
    if (!authorization?.startsWith('Bearer ')) return ''
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; scope?: string }>(authorization.slice(7))
      return payload.scope === 'app' ? payload.sub : ''
    } catch {
      return ''
    }
  }
}

/** 球面距离（米）—— haversine 公式，R2 内联实现 */
function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
