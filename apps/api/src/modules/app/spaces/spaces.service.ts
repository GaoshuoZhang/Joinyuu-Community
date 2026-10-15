import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { CommunityEvent, Prisma, Space, SpaceReservation } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { formatNow, formatToday } from '../../../common/utils/time'
import { assertEnterprisePermission } from '../../../common/enterprise/enterprise-permission'
import { consumePublishingLimit } from '../../../common/enterprise/publishing-limits'
import { eventBlocksWindow, eventCoversDate, eventOccupiesSpace, eventWindowOn } from '../../../common/spaces/event-occupancy'
import { billableHours, chargeSpaceFee, refundSpaceFee, reservationFeePoints } from '../../../common/spaces/booking-fee'
import { discountLabel, discountedPoints, resolveEnterprisePointsDiscount, resolveUserPointsDiscount } from '../../../common/points/points-discount'
import type { CreateReservationDto } from './dto/create-reservation.dto'

/** 空间列表项/详情 DTO（对齐客户端 Space：status=open|maintenance） */
export interface SpaceDto {
  id: string
  name: string
  type: string
  location: string
  capacity: number
  openTime: string
  closeTime: string
  needApproval: boolean
  /** 预约费用（积分/小时）；0 = 免费 */
  feePerHour: number
  equipment: string[]
  status: 'open' | 'maintenance'
  description: string
}

/** 我的预约 DTO（对齐客户端 SpaceReservation：start/end/createdAt/identityType/subjectName）
 * status：pending 待审核 / approved 已通过 / ended 已完成（派生）/ rejected 已驳回 / cancelled 已取消 */
export interface MyReservationDto {
  id: string
  spaceId: string
  spaceName: string
  date: string
  start: string
  end: string
  status: string
  createdAt: string
  identityType?: string
  subjectName?: string
  rejectReason?: string
}

export interface ReservationTimelineDto {
  at: string
  action: string
  title: string
  text?: string
  operator?: string
}

export interface MyReservationDetailDto extends MyReservationDto {
  purpose: string
  attendees: number
  /** 本单实际消耗的积分（0 = 免费空间；驳回/取消已全额退回） */
  feePoints: number
  records: ReservationTimelineDto[]
}

/** 某日可用时段项（对齐客户端 SpaceSlot：start/end/occupied；type 附加来源标注） */
export interface SpaceSlotDto {
  start: string
  end: string
  occupied: boolean
  type?: 'reservation' | 'event'
}

/* 空间预约（M2-R R2 /api/app/spaces）：可预约空间浏览、按日可用时段、
 * 提交预约（开放时段校验 + 冲突预检 409 + 费用扣分）、我的预约与取消（退费）。
 * 可约时段唯一口径 = 后台「开放时间-关闭时间」（Space.openTime/closeTime），
 * 后台没有规则配置入口，故不再按 maxHours/advanceDays 等字段设限。
 * 费用口径见 common/spaces/booking-fee.ts（不足 1 小时按 1 小时计）。
 * 企业成员代企业预约校验 space_reserve 权限；needApproval 空间进入 pending 待审核。 */
@Injectable()
export class AppSpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly notify: NotificationService,
  ) {}

  /** 可预约空间列表：needReservation 且未删除；维护中空间剔除 */
  async list(): Promise<SpaceDto[]> {
    const rows = await this.prisma.space.findMany({
      where: { needReservation: true, deletedAt: null, status: 'available' },
      orderBy: { id: 'asc' },
    })
    return rows.map(toSpaceDto)
  }

  /** 空间详情：不可约（未开启预约 / 维护中 / 不存在）一律 404，不暴露存在性 */
  async detail(id: string): Promise<SpaceDto> {
    const space = await this.findReservable(id)
    return toSpaceDto(space)
  }

  /** 某日可用时段：按空间「开放时间-关闭时间」逐小时切片；待审核/已通过预约 + 已发布活动占用（口径见 event-occupancy）。 */
  async availability(id: string, date: string): Promise<SpaceSlotDto[]> {
    const space = await this.findReservable(id)
    const [reserved, events] = await Promise.all([
      this.prisma.spaceReservation.findMany({
        where: { spaceId: space.id, date, status: { in: ['pending', 'approved'] }, deletedAt: null },
      }),
      this.publishedEventsOn(date),
    ])
    const occupiedReservations = reserved.filter((r) => r.startTime < r.endTime)
    /* 活动占用：命中空间地点后取「该日」的占用时段（跨天活动按天裁剪） */
    const eventWindows = events
      .filter((e) => eventOccupiesSpace(e, space))
      .map((e) => eventWindowOn(e, date))
      .filter((win): win is { start: string; end: string } => win !== null)
    const slots: SpaceSlotDto[] = []
    const open = toMinutes(space.openTime)
    const close = toMinutes(space.closeTime)
    for (let cursor = open; cursor < close; cursor += 60) {
      const start = fromMinutes(cursor)
      const end = fromMinutes(Math.min(cursor + 60, close))
      const res = occupiedReservations.some((r) => overlaps(r.startTime, r.endTime, start, end))
      const evt = eventWindows.some((win) => overlaps(win.start, win.end, start, end))
      slots.push({ start, end, occupied: res || evt, type: res ? 'reservation' : evt ? 'event' : undefined })
    }
    return slots
  }

  /** 提交预约：开放时段校验（维护/开放时间-关闭时间）+ 冲突预检（pending/approved 预约或活动 409）+ 费用扣分 */
  async create(
    user: { uid: string; name: string },
    dto: CreateReservationDto,
  ): Promise<{ status: 'pending' | 'approved'; pointsSpent: number }> {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (cfg && cfg.reservationOpen === false) throw new BadRequestException('空间预约暂未开放')
    const account = await this.prisma.user.findUnique({ where: { uid: user.uid } })
    const phone = account?.phone ?? ''
    const name = account?.nickname || user.name
    const space = await this.findSpaceOr404(dto.spaceId)
    if (!space.needReservation) throw new BadRequestException('该空间未开放预约')
    if (space.status === 'maintenance') throw new BadRequestException('该空间维护中暂不可预约')
    if (space.status !== 'available') throw new BadRequestException('该空间当前不可预约')

    const date = dto.date?.trim()
    if (!date) throw new BadRequestException('请选择预约日期')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
      throw new BadRequestException('预约日期格式不正确')
    }
    if (date < formatToday()) throw new BadRequestException('预约日期不能早于今天')

    const start = dto.start
    const end = dto.end
    if (!start || !end) throw new BadRequestException('请选择预约时段')
    if (!isTime(start) || !isTime(end)) throw new BadRequestException('预约时段格式不正确')
    if (start >= end) throw new BadRequestException('结束时间需晚于开始时间')
    /* 当天预约：时段不得早于当前时刻（避免提交已经过去的时段并落库为 approved） */
    if (date === formatToday() && start <= formatNow().slice(11, 16)) {
      throw new BadRequestException('预约时段已过期，请选择晚于当前时间的时段')
    }
    if (start < space.openTime || end > space.closeTime) {
      throw new BadRequestException(`开放时段为 ${space.openTime}-${space.closeTime}，请在该时段内预约`)
    }
    const attendees = dto.attendees ?? 1
    if (!Number.isInteger(attendees) || attendees < 1) throw new BadRequestException('参与人数至少为 1 人')
    if (attendees > space.capacity) throw new BadRequestException(`参与人数不能超过空间容量 ${space.capacity} 人`)

    /* 费用 = 原价（计费小时 × 每小时积分）再按等级折扣折算：
     * 代企业预约取企业的社区企业等级折扣，其余取本人社区个体等级折扣（口径见 common/points/points-discount）。
     * 真正扣费在事务内条件扣减兜底，此处预检余额。 */
    const baseFee = reservationFeePoints(space.feePerHour, start, end)
    const discount = dto.asEnterpriseId
      ? await resolveEnterprisePointsDiscount(this.prisma, dto.asEnterpriseId)
      : await resolveUserPointsDiscount(this.prisma, user.uid)
    const feePoints = discountedPoints(baseFee, discount)
    if (feePoints > (account?.points ?? 0)) {
      throw new BadRequestException(`积分不足，本次预约需 ${feePoints} 积分`)
    }

    /* 提交前冲突预检：待审核/已通过预约或已发布活动占用时间重叠 → 409 */
    const [reserved, events] = await Promise.all([
      this.prisma.spaceReservation.findMany({
        where: { spaceId: space.id, date, status: { in: ['pending', 'approved'] }, deletedAt: null },
      }),
      this.publishedEventsOn(date),
    ])
    const eventHit = events.some(
      (e) => eventOccupiesSpace(e, space) && eventBlocksWindow(e, date, start, end),
    )
    const resHit = reserved.some(
      (r) =>
        overlaps(r.startTime, r.endTime, start, end) &&
        !(dto.asEnterpriseId && r.asEnterpriseId === dto.asEnterpriseId && r.userId === user.uid),
    )
    if (resHit || eventHit) throw new ConflictException('该时段已被预约，请选择其他时间')

    /* 本人重复预约预检（pending/approved 重叠） */
    const mine = await this.prisma.spaceReservation.findFirst({
      where: { userId: user.uid, spaceId: space.id, date, status: { in: ['pending', 'approved'] }, deletedAt: null },
    })
    if (mine && overlaps(mine.startTime, mine.endTime, start, end)) {
      throw new ConflictException('你已预约该时段，请勿重复提交')
    }

    /* 主体快照：代企业 → 校验 space_reserve 权限并记企业名；否则按身份推导并校验持有关系 */
    let identityType = dto.asIdentity || 'individual'
    let subjectName = ''
    if (dto.asEnterpriseId) {
      const enterprise = await this.prisma.enterprise.findUnique({ where: { id: dto.asEnterpriseId } })
      if (!enterprise) throw new NotFoundException('企业不存在')
      await assertEnterprisePermission(this.prisma, user.uid, dto.asEnterpriseId, 'space_reserve')
      identityType = 'community_enterprise'
      subjectName = subjectName || enterprise.name
    } else if (identityType === 'community_enterprise') {
      throw new BadRequestException('请选择要代表的社区企业')
    } else if (identityType !== 'individual') {
      const held = await this.prisma.userIdentity.findFirst({ where: { userId: user.uid, type: identityType } })
      if (!held) throw new BadRequestException('您暂未关联该身份')
    }
    if (!subjectName) subjectName = await this.resolveSubjectName(user, identityType, dto.asEnterpriseId)

    const status: 'pending' | 'approved' = space.needApproval ? 'pending' : 'approved'
    const now = formatNow()
    const reservationId = await this.ids.next('SR')
    await this.prisma.$transaction(async (tx) => {
      await consumePublishingLimit(tx, user.uid, 'space_reserve', { identityType, enterpriseId: dto.asEnterpriseId })
      /* 同一空间同一天串行化冲突检查，防止两个并发请求同时通过预检。 */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${space.id}:${date}`}))`
      const conflicting = await tx.spaceReservation.findFirst({
        where: {
          spaceId: space.id,
          date,
          status: { in: ['pending', 'approved'] },
          deletedAt: null,
          startTime: { lt: end },
          endTime: { gt: start },
        },
        select: { id: true },
      })
      if (conflicting) throw new ConflictException('该时段已被预约，请选择其他时间')
      /* 费用扣分（与预约单、额度、冲突检查同事务：任一步失败整体回滚） */
      await chargeSpaceFee(tx, this.ids, {
        userId: user.uid,
        points: feePoints,
        reason: `空间预约 ${space.name} ${date} ${start}-${end}（${billableHours(start, end)} 小时${discountLabel(discount)}）`,
      })
      await tx.spaceReservation.create({
        data: {
          id: reservationId,
          userId: user.uid,
          userName: name,
          phone,
          spaceId: space.id,
          spaceName: space.name,
          date,
          startTime: start,
          endTime: end,
          purpose: (dto.topic || '').trim(),
          attendees,
          feePoints,
          status,
          submittedAt: now,
          records: [
            { at: now, action: 'submit', text: `${space.name} ${date} ${start}-${end} 预约提交` },
            ...(!space.needApproval ? [{ at: now, action: 'approve', step: '预约自动通过', text: '该空间免审核，预约提交后立即生效' }] : []),
          ],
          identityType,
          subjectName,
          asEnterpriseId: dto.asEnterpriseId ?? null,
        },
      })
    })

    await this.notify.pushNotice(user.uid, {
      type: 'system',
      title: status === 'approved' ? '预约成功' : '预约已提交，待审核',
      content: `「${space.name}」${date} ${start}-${end} ${status === 'approved' ? '预约成功。' : '预约已提交，审核通过后将通知你。'}${
        feePoints > 0 ? `已扣除 ${feePoints} 积分。` : ''
      }`,
      link: '/me/reservations',
    })
    return { status, pointsSpent: feePoints }
  }

  /** 我的预约（submittedAt 倒序；含 identityType/subjectName 主体快照） */
  async myReservations(uid: string): Promise<MyReservationDto[]> {
    const rows = await this.prisma.spaceReservation.findMany({
      where: { userId: uid, deletedAt: null },
      orderBy: { submittedAt: 'desc' },
    })
    const now = formatNow()
    return rows.map((row) => toMyReservationDto(row, now))
  }

  /** 预约详情：直接按 userId 收敛查询，非本人同样返回不存在。 */
  async myReservationDetail(uid: string, id: string): Promise<MyReservationDetailDto> {
    const reservation = await this.prisma.spaceReservation.findFirst({
      where: { id, userId: uid, deletedAt: null },
    })
    if (!reservation) throw new NotFoundException('预约不存在')
    return {
      ...toMyReservationDto(reservation, formatNow()),
      purpose: reservation.purpose,
      attendees: reservation.attendees,
      feePoints: reservation.feePoints,
      records: toReservationTimeline(reservation.records),
    }
  }

  /** 取消预约：本人 + pending/approved 可取消（approved 释放占用；已扣费用全额退回）；
   *  已过预约结束时间的 approved 已派生为「已完成」，不再允许取消。 */
  async cancel(uid: string, id: string): Promise<{ code: number }> {
    const reservation = await this.prisma.spaceReservation.findUnique({ where: { id } })
    if (!reservation || reservation.deletedAt) throw new NotFoundException('预约不存在')
    if (reservation.userId !== uid) throw new ForbiddenException('无权操作该预约')
    const now = formatNow()
    if (isReservationEnded(reservation, now)) throw new ConflictException('预约已结束，无法取消')
    if (reservation.status !== 'pending' && reservation.status !== 'approved') {
      throw new ConflictException('当前状态不可取消')
    }
    const records = (reservation.records as Prisma.JsonArray) ?? []
    await this.prisma.$transaction(async (tx) => {
      /* 状态条件抢占取消权：并发请求只有一个进入退费逻辑，避免重复退分 */
      const claimed = await tx.spaceReservation.updateMany({
        where: { id, userId: uid, status: { in: ['pending', 'approved'] }, deletedAt: null },
        data: {
          status: 'cancelled',
          records: [...records, { at: now, action: 'cancel', text: `${reservation.spaceName} ${reservation.date} 的预约已取消` }],
        },
      })
      if (claimed.count !== 1) throw new ConflictException('当前状态不可取消')
      await refundSpaceFee(tx, this.ids, {
        userId: uid,
        points: reservation.feePoints,
        reason: `取消空间预约退回积分（${reservation.id}）`,
      })
    })
    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '预约已取消',
      content: `「${reservation.spaceName}」${reservation.date} ${reservation.startTime}-${reservation.endTime} 的预约已取消。${
        reservation.feePoints > 0 ? `${reservation.feePoints} 积分已退回。` : ''
      }`,
      link: '/me/reservations',
    })
    return { code: 0 }
  }

  /* ---------- 私有辅助 ---------- */

  private findReservable(id: string): Promise<Space> {
    return this.prisma.space.findFirst({
      where: { id, deletedAt: null, needReservation: true, status: 'available' },
    }).then((space): Space | never => {
      if (!space) throw new NotFoundException('空间不存在')
      return space
    })
  }

  private findSpaceOr404(id: string): Promise<Space> {
    return this.prisma.space.findFirst({ where: { id, deletedAt: null } }).then((space): Space | never => {
      if (!space) throw new NotFoundException('空间不存在')
      return space
    })
  }

  private async publishedEventsOn(date: string): Promise<CommunityEvent[]> {
    const events = await this.prisma.communityEvent.findMany({
      where: { status: 'published', deletedAt: null },
    })
    return events.filter((e) => eventCoversDate(e, date))
  }

  private async resolveSubjectName(
    user: { uid: string; name: string },
    identityType: string,
    asEnterpriseId?: string,
  ): Promise<string> {
    if (identityType === 'community_enterprise') {
      if (asEnterpriseId) {
        const enterprise = await this.prisma.enterprise.findUnique({ where: { id: asEnterpriseId } })
        if (enterprise) return enterprise.name
      }
      const identity = await this.prisma.userIdentity.findFirst({
        where: { userId: user.uid, type: identityType },
      })
      if (identity?.enterpriseName) return identity.enterpriseName
    }
    return user.name || '未命名'
  }
}

function toSpaceDto(s: Space): SpaceDto {
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    location: s.location,
    capacity: s.capacity,
    openTime: s.openTime,
    closeTime: s.closeTime,
    needApproval: s.needApproval,
    feePerHour: s.feePerHour,
    equipment: s.equipment,
    status: s.status === 'maintenance' ? 'maintenance' : 'open',
    description: s.description,
  }
}

/** 预约是否已结束：已通过且已过预约结束时间。
 * 存储状态保持 approved（不回写数据库）：归档管理按 approved + 日期判定「已结束」自动归档，
 * 改库内状态会让该归档条件失效；因此在 DTO 层派生「已完成」，并同步收紧取消入口。 */
function isReservationEnded(r: Pick<SpaceReservation, 'status' | 'date' | 'endTime'>, now: string): boolean {
  return r.status === 'approved' && `${r.date} ${r.endTime}` <= now
}

function toMyReservationDto(r: SpaceReservation, now: string): MyReservationDto {
  const dto: MyReservationDto = {
    id: r.id,
    spaceId: r.spaceId,
    spaceName: r.spaceName,
    date: r.date,
    start: r.startTime,
    end: r.endTime,
    status: isReservationEnded(r, now) ? 'ended' : r.status,
    createdAt: r.submittedAt,
  }
  if (r.identityType) dto.identityType = r.identityType
  if (r.subjectName) dto.subjectName = r.subjectName
  if (r.rejectReason) dto.rejectReason = r.rejectReason
  return dto
}

function toReservationTimeline(raw: Prisma.JsonValue): ReservationTimelineDto[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const record = entry as Record<string, unknown>
    const action = typeof record.action === 'string' ? record.action : 'update'
    const text = typeof record.comment === 'string' && record.comment.trim()
      ? record.comment.trim()
      : typeof record.text === 'string' && record.text.trim() ? record.text.trim() : undefined
    const operator = typeof record.operator === 'string' && record.operator.trim() ? record.operator.trim() : undefined
    return [{
      at: typeof record.at === 'string' ? record.at : '',
      action,
      title: typeof record.step === 'string' && record.step.trim()
        ? record.step.trim()
        : action === 'submit' ? '提交预约' : action === 'approve' ? '审核通过' : action === 'reject' ? '审核驳回' : action === 'cancel' ? '取消预约' : '状态更新',
      ...(text ? { text } : {}),
      ...(operator ? { operator } : {}),
    }]
  })
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

function fromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function isTime(value: string): boolean {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false
  return Number.isFinite(toMinutes(value))
}

function overlaps(as: string, ae: string, bs: string, be: string): boolean {
  return as < be && bs < ae
}
