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
import { addDays, formatNow, formatToday } from '../../../common/utils/time'
import { assertEnterprisePermission } from '../../../common/enterprise/enterprise-permission'
import { consumePublishingLimit } from '../../../common/enterprise/publishing-limits'
import type { CreateReservationDto } from './dto/create-reservation.dto'

/** 开放时段窗口 */
interface OpenWindow {
  start: string
  end: string
}

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
  equipment: string[]
  status: 'open' | 'maintenance'
  maxHours: number
  advanceDays: number
  openHours: OpenWindow[]
  description: string
}

/** 我的预约 DTO（对齐客户端 SpaceReservation：start/end/createdAt/identityType/subjectName） */
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

/** 某日可用时段项（对齐客户端 SpaceSlot：start/end/occupied；type 附加来源标注） */
export interface SpaceSlotDto {
  start: string
  end: string
  occupied: boolean
  type?: 'reservation' | 'event'
}

/* 空间预约（M2-R R2 /api/app/spaces）：可预约空间浏览、按日可用时段、
 * 提交预约（规则校验 + 冲突预检 409）、我的预约与取消。
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

  /** 某日可用时段：已通过预约 + 已发布活动占用（口径同 wiki §8.8） */
  async availability(id: string, date: string): Promise<SpaceSlotDto[]> {
    const space = await this.findReservable(id)
    const [reserved, events] = await Promise.all([
      this.prisma.spaceReservation.findMany({
        where: { spaceId: space.id, date, status: 'approved', deletedAt: null },
      }),
      this.publishedEventsOn(date),
    ])
    const occupiedReservations = reserved.filter((r) => r.startTime < r.endTime)
    const occupiedEvents = events.filter((e) => this.eventOccupiesSpace(e, space))
    const slots: SpaceSlotDto[] = []
    for (const window of this.openWindows(space)) {
      const open = toMinutes(window.start)
      const close = toMinutes(window.end)
      for (let cursor = open; cursor < close; cursor += 60) {
        const start = fromMinutes(cursor)
        const end = fromMinutes(Math.min(cursor + 60, close))
        const res = occupiedReservations.some((r) => overlaps(r.startTime, r.endTime, start, end))
        const evt = occupiedEvents.some((e) => overlaps(toHHMM(e.startTime), toHHMM(e.endTime), start, end))
        slots.push({ start, end, occupied: res || evt, type: res ? 'reservation' : evt ? 'event' : undefined })
      }
    }
    return slots
  }

  /** 提交预约：规则校验（维护/提前天数/最长时长/开放时段）+ 冲突预检（approved 预约或活动 409） */
  async create(user: { uid: string; name: string }, dto: CreateReservationDto): Promise<{ status: 'pending' | 'approved' }> {
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
    const advanceDays = space.advanceDays ?? 0
    if (advanceDays > 0 && date > addDays(formatToday(), advanceDays)) {
      throw new BadRequestException(`仅支持提前 ${advanceDays} 天预约`)
    }

    const start = dto.start ?? dto.startTime
    const end = dto.end ?? dto.endTime
    if (!start || !end) throw new BadRequestException('请选择预约时段')
    if (!isTime(start) || !isTime(end)) throw new BadRequestException('预约时段格式不正确')
    if (start >= end) throw new BadRequestException('结束时间需晚于开始时间')
    const durationHours = (toMinutes(end) - toMinutes(start)) / 60
    const maxHours = space.maxHours ?? 0
    if (maxHours > 0 && durationHours > maxHours) throw new BadRequestException(`单次预约最长 ${maxHours} 小时`)
    if (!this.withinOpenHours(space, start, end)) throw new BadRequestException('不在开放时段内')
    const attendees = dto.attendees ?? 1
    if (!Number.isInteger(attendees) || attendees < 1) throw new BadRequestException('参与人数至少为 1 人')
    if (attendees > space.capacity) throw new BadRequestException(`参与人数不能超过空间容量 ${space.capacity} 人`)

    /* 提交前冲突预检：已通过预约或已发布活动占用时间重叠 → 409 */
    const [reserved, events] = await Promise.all([
      this.prisma.spaceReservation.findMany({
        where: { spaceId: space.id, date, status: 'approved', deletedAt: null },
      }),
      this.publishedEventsOn(date),
    ])
    const eventHit = events.some(
      (e) =>
        this.eventOccupiesSpace(e, space) &&
        overlaps(toHHMM(e.startTime), toHHMM(e.endTime), start, end),
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

    /* 主体快照：代企业 → 校验 space_reserve 权限并记企业名；否则按身份推导 */
    let identityType = dto.asIdentity || dto.identityType || 'individual'
    let subjectName = dto.subjectName?.trim()
    if (dto.asEnterpriseId) {
      const enterprise = await this.prisma.enterprise.findUnique({ where: { id: dto.asEnterpriseId } })
      if (!enterprise) throw new NotFoundException('企业不存在')
      await assertEnterprisePermission(this.prisma, user.uid, dto.asEnterpriseId, 'space_reserve')
      identityType = 'community_enterprise'
      subjectName = subjectName || enterprise.name
    } else if (identityType === 'community_enterprise') {
      throw new BadRequestException('请选择要代表的社区企业')
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
          purpose: (dto.topic || dto.purpose || '').trim(),
          attendees,
          status,
          submittedAt: now,
          records: [{ at: now, action: 'submit', text: `${space.name} ${date} ${start}-${end} 预约提交` }],
          identityType,
          subjectName,
          asEnterpriseId: dto.asEnterpriseId ?? null,
        },
      })
    })

    await this.notify.pushNotice(user.uid, {
      type: 'system',
      title: status === 'approved' ? '预约成功' : '预约已提交，待审核',
      content: `「${space.name}」${date} ${start}-${end} ${status === 'approved' ? '预约成功。' : '预约已提交，审核通过后将通知你。'}`,
      link: '/me/reservations',
    })
    return { status }
  }

  /** 我的预约（submittedAt 倒序；含 identityType/subjectName 主体快照） */
  async myReservations(uid: string): Promise<MyReservationDto[]> {
    const rows = await this.prisma.spaceReservation.findMany({
      where: { userId: uid, deletedAt: null },
      orderBy: { submittedAt: 'desc' },
    })
    return rows.map(toMyReservationDto)
  }

  /** 取消预约：本人 + pending/approved 可取消（approved 释放占用） */
  async cancel(uid: string, id: string): Promise<{ code: number }> {
    const reservation = await this.prisma.spaceReservation.findUnique({ where: { id } })
    if (!reservation || reservation.deletedAt) throw new NotFoundException('预约不存在')
    if (reservation.userId !== uid) throw new ForbiddenException('无权操作该预约')
    if (reservation.status !== 'pending' && reservation.status !== 'approved') {
      throw new ConflictException('当前状态不可取消')
    }
    const records = (reservation.records as Prisma.JsonArray) ?? []
    await this.prisma.spaceReservation.update({
      where: { id },
      data: {
        status: 'cancelled',
        records: [...records, { at: formatNow(), action: 'cancel', text: `${reservation.spaceName} ${reservation.date} 的预约已取消` }],
      },
    })
    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '预约已取消',
      content: `「${reservation.spaceName}」${reservation.date} ${reservation.startTime}-${reservation.endTime} 的预约已取消。`,
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

  /** 开放时段窗口（优先 Json openHours，缺省用 openTime-closeTime）。 */
  private openWindows(space: Space): OpenWindow[] {
    const raw = space.openHours as OpenWindow[] | null | undefined
    return Array.isArray(raw) && raw.length > 0 ? raw : [{ start: space.openTime, end: space.closeTime }]
  }

  private withinOpenHours(space: Space, start: string, end: string): boolean {
    const raw = space.openHours as OpenWindow[] | null | undefined
    const windows = Array.isArray(raw) && raw.length > 0 ? raw : [{ start: space.openTime, end: space.closeTime }]
    return windows.some((w) => start >= w.start && end <= w.end)
  }

  private async publishedEventsOn(date: string): Promise<CommunityEvent[]> {
    const events = await this.prisma.communityEvent.findMany({
      where: { status: 'published', deletedAt: null },
    })
    return events.filter((e) => e.startTime.slice(0, 10) <= date && date <= e.endTime.slice(0, 10))
  }

  /** 活动占用空间判定：活动 location 命中空间名或空间地址（schema 无 spaceId 外键，R2 以位置匹配近似） */
  private eventOccupiesSpace(event: CommunityEvent, space: Space): boolean {
    const loc = event.location
    return loc.includes(space.name) || loc.includes(space.location)
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
  const raw = s.openHours as OpenWindow[] | null | undefined
  const openHours =
    Array.isArray(raw) && raw.length > 0
      ? raw.map((w) => ({ start: w.start, end: w.end }))
      : [{ start: s.openTime, end: s.closeTime }]
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    location: s.location,
    capacity: s.capacity,
    openTime: s.openTime,
    closeTime: s.closeTime,
    needApproval: s.needApproval,
    equipment: s.equipment,
    status: s.status === 'maintenance' ? 'maintenance' : 'open',
    maxHours: s.maxHours ?? 0,
    advanceDays: s.advanceDays ?? 0,
    openHours,
    description: s.description,
  }
}

function toMyReservationDto(r: SpaceReservation): MyReservationDto {
  const dto: MyReservationDto = {
    id: r.id,
    spaceId: r.spaceId,
    spaceName: r.spaceName,
    date: r.date,
    start: r.startTime,
    end: r.endTime,
    status: r.status,
    createdAt: r.submittedAt,
  }
  if (r.identityType) dto.identityType = r.identityType
  if (r.subjectName) dto.subjectName = r.subjectName
  if (r.rejectReason) dto.rejectReason = r.rejectReason
  return dto
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

/** 'YYYY-MM-DD HH:mm' → 'HH:mm'（取日期时间串的时分段） */
function toHHMM(dt: string): string {
  return dt.length >= 16 ? dt.slice(11, 16) : dt
}

function overlaps(as: string, ae: string, bs: string, be: string): boolean {
  return as < be && bs < ae
}
