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
import type { SpacePayloadDto } from './dto/space-payload.dto'
import type { QueryReservationsDto } from './dto/query-reservations.dto'

/* 公共空间模块（wiki-backend.md §7.13/§8.8）：
 * 预约审批通过前做时段冲突校验（同空间已通过预约 + 同名空间已发布社区活动）；
 * 审批流复用 ApprovalRecord 时间线；使用看板 = 当日已通过预约 + 同名空间已发布活动合并。
 * 审计仅审批埋点（空间管理 预约审批通过/驳回，M0 spaces 模块仅有此一处 recordAudit）。 */

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
  equipment: string[]
  status: string
  description: string
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
    equipment: s.equipment,
    status: s.status,
    description: s.description,
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
    const rows = await this.prisma.space.findMany({ orderBy: { id: 'asc' } })
    return rows.map(toSpaceDto)
  }

  async findOne(id: string): Promise<SpaceDto & { reservations: ReservationDto[] }> {
    const space = await this.prisma.space.findUnique({ where: { id } })
    if (!space) throw new NotFoundException('空间不存在')

    const reservations = await this.prisma.spaceReservation.findMany({
      where: { spaceId: id },
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
    const space = await this.prisma.space.findUnique({ where: { id } })
    if (!space) throw new NotFoundException('空间不存在')

    await this.prisma.space.update({ where: { id }, data: this.spaceData(payload) })
    return { code: 0 }
  }

  async setSpaceStatus(id: string, status: string): Promise<{ code: number }> {
    const space = await this.prisma.space.findUnique({ where: { id } })
    if (!space) throw new NotFoundException('空间不存在')

    await this.prisma.space.update({ where: { id }, data: { status } })
    return { code: 0 }
  }

  /* ---------- 空间预约（含审批流） ---------- */

  async findReservations(
    query: QueryReservationsDto,
  ): Promise<{ list: ReservationDto[]; total: number }> {
    const where: Prisma.SpaceReservationWhereInput = {}
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { userName: { contains: kw, mode: 'insensitive' } },
        { spaceName: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.spaceId) where.spaceId = query.spaceId
    if (query.status) where.status = query.status
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
    if (reservation.status !== 'pending') {
      throw new ConflictException('该预约已处理，请勿重复审批')
    }

    if (status === 'approved') {
      await this.assertNoConflict(reservation)
    }

    const records = (reservation.records as unknown as ApprovalRecord[]) ?? []
    const record: ApprovalRecord = {
      step: '管理员审批',
      operator,
      action: status === 'approved' ? 'approve' : 'reject',
      comment: comment ?? (status === 'approved' ? '同意预约' : ''),
      at: formatNow(),
    }
    records.push(record)

    await this.prisma.spaceReservation.update({
      where: { id },
      data: {
        status,
        records: records as unknown as Prisma.InputJsonValue,
        ...(status === 'rejected' ? { rejectReason: comment ?? '' } : {}),
      },
    })

    await this.audit.record({
      module: '空间管理',
      action: status === 'approved' ? '预约审批通过' : '预约审批驳回',
      target: `${reservation.id} · ${reservation.spaceName}`,
      detail: comment,
      operator,
    })
    return { code: 0 }
  }

  async cancelReservation(id: string): Promise<{ code: number }> {
    const reservation = await this.prisma.spaceReservation.findUnique({ where: { id } })
    if (!reservation) throw new NotFoundException('空间预约不存在')
    if (reservation.status !== 'pending' && reservation.status !== 'approved') {
      throw new ConflictException('仅待审批或已通过的预约可取消')
    }

    await this.prisma.spaceReservation.update({ where: { id }, data: { status: 'cancelled' } })
    return { code: 0 }
  }

  /* ---------- 使用看板 ---------- */

  async usageBoard(date: string): Promise<SpaceOccupancy[]> {
    const reservations = await this.prisma.spaceReservation.findMany({
      where: { status: 'approved', date },
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
      where: { status: 'published', startTime: { startsWith: date } },
    })
    if (events.length > 0) {
      const spaces = await this.prisma.space.findMany()
      const byName = new Map(spaces.map((s) => [s.name, s]))
      for (const e of events) {
        const space = byName.get(e.location)
        if (!space) continue
        list.push({
          spaceId: space.id,
          spaceName: space.name,
          startTime: e.startTime.slice(11, 16),
          endTime: e.endTime.slice(11, 16),
          title: `社区活动「${e.title}」`,
          organizer: e.host,
          source: 'event',
        })
      }
    }

    list.sort((a, b) => a.spaceId.localeCompare(b.spaceId) || a.startTime.localeCompare(b.startTime))
    return list
  }

  /* 审批通过前时段冲突校验（对照 M0 reviewReservation 两条分支） */
  private async assertNoConflict(reservation: SpaceReservation): Promise<void> {
    const clash = await this.prisma.spaceReservation.findFirst({
      where: {
        id: { not: reservation.id },
        spaceId: reservation.spaceId,
        date: reservation.date,
        status: 'approved',
        startTime: { lt: reservation.endTime },
        endTime: { gt: reservation.startTime },
      },
    })
    if (clash) throw new ConflictException('该时段已有已通过的预约，无法重复占用')

    const space = await this.prisma.space.findUnique({ where: { id: reservation.spaceId } })
    if (!space) return
    const events = await this.prisma.communityEvent.findMany({
      where: {
        status: 'published',
        location: space.name,
        startTime: { startsWith: reservation.date },
      },
    })
    const eventClash = events.some((e) => {
      const eventStart = e.startTime.slice(11, 16)
      const eventEnd = e.endTime.slice(11, 16)
      return reservation.startTime < eventEnd && eventStart < reservation.endTime
    })
    if (eventClash) throw new ConflictException('该时段被社区活动占用，无法通过')
  }

  /* 创建/编辑共用字段（allDay 存 00:00/23:59；needApproval 联动 needReservation） */
  private spaceData(payload: SpacePayloadDto) {
    const allDay = payload.allDay
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
      equipment: payload.equipment,
      description: payload.description,
    }
  }
}
