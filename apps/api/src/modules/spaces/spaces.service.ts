import { exclusivePriceData } from '../../common/dto/business-charge.dto'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma, Space, SpaceReservation } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow } from '../../common/utils/time'
import { eventBlocksWindow, eventDates, eventOccupiesSpace, eventWindowOn } from '../../common/spaces/event-occupancy'
import { refundSpaceFee } from '../../common/spaces/booking-fee'
import type { SpacePayloadDto } from './dto/space-payload.dto'
import type { QueryReservationsDto } from './dto/query-reservations.dto'

/* 公共空间模块（wiki-backend.md §7.13/§8.8）：
 * 预约审核通过前做时段冲突校验（同空间已通过预约 + 同名空间已发布社区活动）；
 * 审核流复用 ApprovalRecord 时间线；使用看板 = 当日已通过预约 + 同名空间已发布活动合并。
 * 审计仅审核埋点（空间管理 预约审核通过/驳回）。 */

export interface ApprovalRecord {
  step: string
  operator: string
  action: string
  comment: string
  at: string
}

export interface SpaceDto {
  id: string
  name: string
  type: string
  capacity: number
  location: string
  openTime: string
  closeTime: string
  allDay: boolean
  needReservation: boolean
  needApproval: boolean
  /** 预约费用（积分/小时）；0 = 免费 */
  feePerHour: number
  equipment: string[]
  status: string
  chargeAmountFen?: number
  chargeRefundPolicy?: string
  description: string
  /** 自定义可见范围（空数组 = 不限）：身份 + 等级；仅需预约空间有意义 */
  visibilityIdentities: string[]
  visibilityLevels: string[]
  /** 自定义可预约范围（空数组 = 不限）：身份 + 等级 */
  reservationIdentities: string[]
  reservationLevels: string[]
  deletedAt?: string
}

export interface ReservationDto {
  id: string
  userId: string
  userName: string
  phone: string
  spaceId: string
  spaceName: string
  date: string
  startTime: string
  endTime: string
  purpose: string
  attendees: number
  status: string
  submittedAt: string
  records: ApprovalRecord[]
  rejectReason?: string
}

export interface SpaceOccupancy {
  spaceId: string
  spaceName: string
  startTime: string
  endTime: string
  title: string
  organizer: string
  source: 'reservation' | 'event'
}

/** 空间的活动占用项（按日展开；startTime/endTime 为该日的占用时段，跨天活动按天裁剪） */
export interface SpaceEventOccupancyDto {
  eventId: string
  date: string
  startTime: string
  endTime: string
  title: string
  host: string
}

function toSpaceDto(s: Space): SpaceDto {
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    capacity: s.capacity,
    location: s.location,
    openTime: s.openTime,
    closeTime: s.closeTime,
    allDay: s.allDay,
    needReservation: s.needReservation,
    needApproval: s.needApproval,
    feePerHour: s.feePerHour,
    equipment: s.equipment,
    status: s.status,
    chargeAmountFen: s.chargeAmountFen ?? 0,
    chargeRefundPolicy: s.chargeRefundPolicy ?? '',
    description: s.description,
    visibilityIdentities: s.visibilityIdentities,
    visibilityLevels: s.visibilityLevels,
    reservationIdentities: s.reservationIdentities,
    reservationLevels: s.reservationLevels,
    deletedAt: s.deletedAt ?? undefined,
  }
}

function toReservationDto(r: SpaceReservation): ReservationDto {
  const dto: ReservationDto = {
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    phone: r.phone,
    spaceId: r.spaceId,
    spaceName: r.spaceName,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    purpose: r.purpose,
    attendees: r.attendees,
    status: r.status,
    submittedAt: r.submittedAt,
    records: (r.records as unknown as ApprovalRecord[]) ?? [],
  }
  if (r.rejectReason != null) dto.rejectReason = r.rejectReason
  return dto
}

@Injectable()
export class SpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  /* ---------- 空间管理 ---------- */

  async findAll(): Promise<SpaceDto[]> {
    const rows = await this.prisma.space.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } })
    return rows.map(toSpaceDto)
  }

  async findOne(id: string): Promise<SpaceDto & { reservations: ReservationDto[] }> {
    const space = await this.prisma.space.findUnique({ where: { id } })
    if (!space) throw new NotFoundException('空间不存在')

    const reservations = await this.prisma.spaceReservation.findMany({
      where: { spaceId: id, deletedAt: null },
      orderBy: { id: 'asc' },
    })
    return { ...toSpaceDto(space), reservations: reservations.map(toReservationDto) }
  }

  async createSpace(payload: SpacePayloadDto): Promise<SpaceDto> {
    const data = this.spaceData(payload)
    const created = await this.prisma.space.create({
      data: { ...data, id: await this.ids.next('S'), status: 'available' },
    })
    return toSpaceDto(created)
  }

  async updateSpace(id: string, payload: SpacePayloadDto): Promise<{ code: number }> {
    const space = await this.prisma.space.findFirst({ where: { id, deletedAt: null } })
    if (!space) throw new NotFoundException('空间不存在')

    await this.prisma.space.update({ where: { id }, data: this.spaceData(payload, space) })
    return { code: 0 }
  }

  async setSpaceStatus(id: string, status: string): Promise<{ code: number }> {
    const space = await this.prisma.space.findFirst({ where: { id, deletedAt: null } })
    if (!space) throw new NotFoundException('空间不存在')

    await this.prisma.space.update({ where: { id }, data: { status } })
    return { code: 0 }
  }

  /* ---------- 空间预约（含审核流） ---------- */

  async findReservations(
    query: QueryReservationsDto,
  ): Promise<{ list: ReservationDto[]; total: number }> {
    const where: Prisma.SpaceReservationWhereInput = { deletedAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { userName: { contains: kw, mode: 'insensitive' } },
        { spaceName: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.spaceId) where.spaceId = query.spaceId
    if (query.status && ['approved', 'using', 'ended'].includes(query.status)) {
      where.status = 'approved'
      const now = formatNow()
      const date = now.slice(0, 10)
      const time = now.slice(11, 16)
      const period: Prisma.SpaceReservationWhereInput = query.status === 'approved'
        ? { OR: [{ date: { gt: date } }, { date, startTime: { gt: time } }] }
        : query.status === 'using'
          ? { date, startTime: { lte: time }, endTime: { gte: time } }
          : { OR: [{ date: { lt: date } }, { date, endTime: { lt: time } }] }
      where.AND = [period]
    } else if (query.status) where.status = query.status
    if (query.date) where.date = query.date

    const [rows, total] = await Promise.all([
      this.prisma.spaceReservation.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.spaceReservation.count({ where }),
    ])
    return { list: rows.map(toReservationDto), total }
  }

  async reviewReservation(
    id: string,
    status: string,
    comment: string | undefined,
    operator: string,
  ): Promise<{ code: number }> {
    const reservation = await this.prisma.spaceReservation.findUnique({ where: { id } })
    if (!reservation) throw new NotFoundException('空间预约不存在')

    /* BE-M1 并发审核串行化：对同空间同日期的审核加咨询锁。
     * 两个 pending 重叠预约被并发双通过的场景：锁保证第二个事务在第一个提交后才复查，
     * 此时 assertNoConflict 能看到刚通过的预约 → 拒绝冲突。 */
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<unknown[]>`
        SELECT pg_advisory_xact_lock(hashtext(${`space_rv:${reservation.spaceId}:${reservation.date}`}))::text AS locked`

      const fresh = await tx.spaceReservation.findUnique({ where: { id } })
      if (!fresh || fresh.status !== 'pending') {
        throw new ConflictException('该预约已处理，请勿重复审核')
      }

      if (status === 'approved') {
        await this.assertNoConflict(tx, fresh)
      }

      const records = (fresh.records as unknown as ApprovalRecord[]) ?? []
      const record: ApprovalRecord = {
        step: '管理员审核',
        operator,
        action: status === 'approved' ? 'approve' : 'reject',
        comment: comment ?? (status === 'approved' ? '同意预约' : ''),
        at: formatNow(),
      }
      records.push(record)

      await tx.spaceReservation.update({
        where: { id },
        data: {
          status,
          records: records as unknown as Prisma.InputJsonValue,
          ...(status === 'rejected'
            ? { rejectReason: comment ?? '', archivableAt: formatNow() }
            : {}),
        },
      })

      /* 驳回即退费：退回该预约已扣的积分（与状态迁移同事务） */
      if (status === 'rejected') {
        await refundSpaceFee(tx, this.ids, {
          userId: fresh.userId,
          points: fresh.feePoints,
          reason: `空间预约驳回退回积分（${fresh.id}）`,
        })
      }
    })

    await this.audit.record({
      module: '空间管理',
      action: status === 'approved' ? '预约审核通过' : '预约审核驳回',
      target: `${reservation.id} · ${reservation.spaceName}`,
      detail: comment,
      before: { status: reservation.status },
      after: { status },
      operator,
    })
    return { code: 0 }
  }

  /** 管理端取消预约：pending/approved 可取消；已扣费用全额退回（状态条件抢占，避免重复退分） */
  async cancelReservation(id: string): Promise<{ code: number }> {
    const reservation = await this.prisma.spaceReservation.findFirst({
      where: { id, deletedAt: null },
    })
    if (!reservation) throw new NotFoundException('空间预约不存在')
    if (reservation.status !== 'pending' && reservation.status !== 'approved') {
      throw new ConflictException('仅待审核或已通过的预约可取消')
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.spaceReservation.updateMany({
        where: { id, status: { in: ['pending', 'approved'] }, deletedAt: null },
        data: { status: 'cancelled', archivableAt: formatNow() },
      })
      if (claimed.count !== 1) throw new ConflictException('仅待审核或已通过的预约可取消')
      await refundSpaceFee(tx, this.ids, {
        userId: reservation.userId,
        points: reservation.feePoints,
        reason: `后台取消空间预约退回积分（${reservation.id}）`,
      })
    })
    return { code: 0 }
  }

  async archive(id: string, operator: string): Promise<{ code: number }> {
    const reservation = await this.prisma.spaceReservation.findFirst({
      where: { id, deletedAt: null },
    })
    if (!reservation) throw new NotFoundException('预约不存在')

    const ended = reservation.status === 'approved' && `${reservation.date} ${reservation.endTime}` <= formatNow()
    if (!['rejected', 'cancelled'].includes(reservation.status) && !ended) {
      throw new ConflictException('仅已结束、已驳回或已取消的预约可归档')
    }

    await this.prisma.spaceReservation.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '空间管理',
      action: '归档空间预约',
      target: `${reservation.id} · ${reservation.spaceName}`,
      before: { status: reservation.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }

  /* ---------- 使用看板 ---------- */

  async usageBoard(date: string): Promise<SpaceOccupancy[]> {
    const reservations = await this.prisma.spaceReservation.findMany({
      where: { status: 'approved', date, deletedAt: null },
    })
    const list: SpaceOccupancy[] = reservations.map((r) => ({
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      startTime: r.startTime,
      endTime: r.endTime,
      title: r.purpose,
      organizer: r.userName,
      source: 'reservation',
    }))

    const events = await this.prisma.communityEvent.findMany({
      where: { status: 'published', deletedAt: null },
    })
    if (events.length > 0) {
      const spaces = await this.prisma.space.findMany({ where: { deletedAt: null } })
      for (const e of events) {
        /* 活动占用口径与客户端可约时段一致（地点命中空间 + 该日占用时段） */
        const space = spaces.find((s) => eventOccupiesSpace(e, s))
        const win = space ? eventWindowOn(e, date) : null
        if (!space || !win) continue
        list.push({
          spaceId: space.id,
          spaceName: space.name,
          startTime: win.start,
          endTime: win.end,
          title: `社区活动「${e.title}」`,
          organizer: e.host,
          source: 'event',
        })
      }
    }

    list.sort((a, b) => a.spaceId.localeCompare(b.spaceId) || a.startTime.localeCompare(b.startTime))
    return list
  }

  /** 空间的活动占用明细（按日展开）：空间详情页的预约日历与明细列表据此展示活动占用 */
  async eventOccupancy(id: string): Promise<SpaceEventOccupancyDto[]> {
    const space = await this.prisma.space.findUnique({ where: { id } })
    if (!space) throw new NotFoundException('空间不存在')

    const events = await this.prisma.communityEvent.findMany({
      where: { status: 'published', deletedAt: null },
    })
    const rows: SpaceEventOccupancyDto[] = []
    for (const e of events) {
      if (!eventOccupiesSpace(e, space)) continue
      for (const date of eventDates(e)) {
        const win = eventWindowOn(e, date)
        if (!win) continue
        rows.push({ eventId: e.id, date, startTime: win.start, endTime: win.end, title: e.title, host: e.host })
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  }

  /* 审核通过前时段冲突校验（两条分支）；db 注入事务客户端时在事务内复核，避免并发双通过 */
  private async assertNoConflict(
    db: Prisma.TransactionClient | PrismaService,
    reservation: SpaceReservation,
  ): Promise<void> {
    const clash = await db.spaceReservation.findFirst({
      where: {
        id: { not: reservation.id },
        spaceId: reservation.spaceId,
        date: reservation.date,
        status: 'approved',
        deletedAt: null,
        startTime: { lt: reservation.endTime },
        endTime: { gt: reservation.startTime },
      },
    })
    if (clash) throw new ConflictException('该时段已有已通过的预约，无法重复占用')

    const space = await db.space.findUnique({ where: { id: reservation.spaceId } })
    if (!space) return
    const events = await db.communityEvent.findMany({
      where: { status: 'published', deletedAt: null },
    })
    const eventClash = events.some(
      (e) => eventOccupiesSpace(e, space) && eventBlocksWindow(e, reservation.date, reservation.startTime, reservation.endTime),
    )
    if (eventClash) throw new ConflictException('该时段被社区活动占用，无法通过')
  }

  /* 新增/编辑共用字段（allDay 存 00:00/23:59；needApproval 联动 needReservation；feePerHour 0=免费）
   * 可见/可预约范围：关闭「需预约」时统一清空（客户端过滤与预约校验只作用于需预约空间） */
  private spaceData(payload: SpacePayloadDto, previous?: { chargeAmountFen: number; chargeRefundPolicy: string }) {
    const allDay = payload.allDay
    const reservable = payload.needReservation
    return {
      name: payload.name,
      type: payload.type,
      capacity: payload.capacity,
      location: payload.location,
      openTime: allDay ? '00:00' : payload.openTime,
      closeTime: allDay ? '23:59' : payload.closeTime,
      allDay,
      needReservation: payload.needReservation,
      needApproval: payload.needReservation ? payload.needApproval : false,
      feePerHour: payload.feePerHour ?? 0,
      equipment: payload.equipment,
      description: payload.description,
      ...exclusivePriceData(payload, payload.feePerHour ?? 0, previous),
      visibilityIdentities: reservable ? payload.visibilityIdentities ?? [] : [],
      visibilityLevels: reservable ? payload.visibilityLevels ?? [] : [],
      reservationIdentities: reservable ? payload.reservationIdentities ?? [] : [],
      reservationLevels: reservable ? payload.reservationLevels ?? [] : [],
    }
  }
}
