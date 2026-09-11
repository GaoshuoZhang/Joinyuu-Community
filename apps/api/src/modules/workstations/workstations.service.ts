import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Lease, LeaseWorkstation, Workstation, WorkstationArea } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow, formatToday } from '../../common/utils/time'
import type { WorkstationAreaPayloadDto } from './dto/workstation-area.dto'
import type { WorkstationPayloadDto } from './dto/workstation-payload.dto'
import type { LeasePayloadDto } from './dto/lease-payload.dto'
import type { LeaseUpdateDto } from './dto/lease-update.dto'

/* 办公位与租约模块（wiki-backend.md §7.12/§8.1/§8.3）：
 * 区域外键化（办公位存 areaId，读取 join 出 area 名，改名无需级联）；
 * 租约新增/终止事务锁定/释放办公位；expiring/expired 由前端读取派生（服务端仅存 active/terminated）。 */

type WorkstationWithArea = Workstation & { area: WorkstationArea }
type LeaseWithWorkstations = Lease & {
  workstations: Array<LeaseWorkstation & { workstation: Workstation }>
}

export interface WorkstationDto {
  id: string
  seatNo: string
  area: string
  type: string
  capacity: number
  status: string
  enterpriseId?: string
  enterpriseName?: string
  leaseId?: string
  defaultMonthlyRent?: number
  areaSqm?: number
  note?: string
}

export interface LeaseDto {
  id: string
  enterpriseId: string
  enterpriseName: string
  renterType: string
  workstationIds: string[]
  workstationLabels: string[]
  startDate: string
  endDate: string
  longTerm: boolean
  status: string
  monthlyRent: number
  rentPeriod: string
  contactName: string
  contactPhone: string
  terminatedAt?: string
  deletedAt?: string
}

export interface RenterOptionsDto {
  users: Array<{ uid: string; nickname: string; phone: string }>
  enterprises: Array<{ id: string; name: string; contactName: string; contactPhone: string }>
}

function toWorkstationDto(w: WorkstationWithArea): WorkstationDto {
  const dto: WorkstationDto = {
    id: w.id,
    seatNo: w.seatNo,
    area: w.area.name,
    type: w.type,
    capacity: w.capacity,
    status: w.status,
  }
  if (w.enterpriseId != null) dto.enterpriseId = w.enterpriseId
  if (w.enterpriseName != null) dto.enterpriseName = w.enterpriseName
  if (w.leaseId != null) dto.leaseId = w.leaseId
  if (w.defaultMonthlyRent != null) dto.defaultMonthlyRent = w.defaultMonthlyRent
  if (w.areaSqm != null) dto.areaSqm = w.areaSqm
  if (w.note != null) dto.note = w.note
  return dto
}

function toLeaseDto(l: LeaseWithWorkstations): LeaseDto {
  /* 关联表无序号列，按 workstationId 升序重建（与办公位编号 seatNo 序一致） */
  const sorted = [...l.workstations].sort((a, b) => a.workstationId.localeCompare(b.workstationId))
  const dto: LeaseDto = {
    id: l.id,
    enterpriseId: l.renterId,
    enterpriseName: l.renterName,
    renterType: l.renterType,
    workstationIds: sorted.map((x) => x.workstationId),
    workstationLabels: sorted.map((x) => x.workstation.seatNo),
    startDate: l.startDate,
    endDate: l.endDate,
    longTerm: l.longTerm,
    status: l.status,
    monthlyRent: l.monthlyRent,
    rentPeriod: l.rentPeriod,
    contactName: l.contactName,
    contactPhone: l.contactPhone,
  }
  if (l.terminatedAt != null) dto.terminatedAt = l.terminatedAt
  if (l.deletedAt != null) dto.deletedAt = l.deletedAt
  return dto
}

@Injectable()
export class WorkstationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  /* ---------- 办公位 ---------- */

  async findAll(): Promise<WorkstationDto[]> {
    const rows = await this.prisma.workstation.findMany({
      include: { area: true },
      orderBy: { id: 'asc' },
    })
    return rows.map(toWorkstationDto)
  }

  /* ---------- 区域规划 ---------- */

  async findAreas(): Promise<WorkstationArea[]> {
    return this.prisma.workstationArea.findMany({ orderBy: { id: 'asc' } })
  }

  async createArea(payload: WorkstationAreaPayloadDto): Promise<WorkstationArea> {
    const name = payload.name.trim()
    const exists = await this.prisma.workstationArea.findUnique({ where: { name } })
    if (exists) throw new BadRequestException('区域名称已存在')

    return this.prisma.workstationArea.create({
      data: {
        id: await this.ids.next('WA'),
        name,
        type: payload.type,
        description: payload.description,
        createdAt: formatToday(),
      },
    })
  }

  async updateArea(id: string, payload: WorkstationAreaPayloadDto): Promise<{ code: number }> {
    const area = await this.prisma.workstationArea.findUnique({ where: { id } })
    if (!area) throw new NotFoundException('区域不存在')

    const name = payload.name.trim()
    const duplicate = await this.prisma.workstationArea.findUnique({ where: { name } })
    if (duplicate && duplicate.id !== id) throw new BadRequestException('区域名称已存在')

    await this.prisma.workstationArea.update({
      where: { id },
      data: { name, type: payload.type, description: payload.description },
    })
    return { code: 0 }
  }

  async deleteArea(id: string): Promise<{ code: number }> {
    const area = await this.prisma.workstationArea.findUnique({ where: { id } })
    if (!area) throw new NotFoundException('区域不存在')

    const count = await this.prisma.workstation.count({ where: { areaId: id } })
    if (count > 0) {
      throw new ConflictException('该区域下仍有办公位，无法删除；请先移出或删除区域内全部办公位')
    }

    await this.prisma.workstationArea.delete({ where: { id } })
    return { code: 0 }
  }

  /* ---------- 办公位新增 / 资料编辑 ---------- */

  async createWorkstation(payload: WorkstationPayloadDto): Promise<WorkstationDto> {
    const area = await this.prisma.workstationArea.findUnique({ where: { name: payload.area } })
    if (!area) throw new NotFoundException('所属区域不存在，请先在区域规划中新增')

    const seatNo = payload.seatNo.trim()
    const dup = await this.prisma.workstation.findUnique({ where: { seatNo } })
    if (dup) throw new BadRequestException('办公位编号已存在')

    const created = await this.prisma.workstation.create({
      data: {
        id: await this.ids.next('WS'),
        seatNo,
        areaId: area.id,
        type: payload.type,
        capacity: payload.capacity,
        status: 'idle',
        note: payload.note ?? null,
        defaultMonthlyRent: payload.defaultMonthlyRent ?? null,
        areaSqm: payload.type === 'office' ? payload.areaSqm ?? null : null,
      },
      include: { area: true },
    })
    return toWorkstationDto(created)
  }

  async updateWorkstation(id: string, payload: WorkstationPayloadDto): Promise<{ code: number }> {
    const ws = await this.prisma.workstation.findUnique({ where: { id } })
    if (!ws) throw new NotFoundException('办公位不存在')

    const area = await this.prisma.workstationArea.findUnique({ where: { name: payload.area } })
    if (!area) throw new NotFoundException('所属区域不存在，请先在区域规划中新增')

    const seatNo = payload.seatNo.trim()
    const dup = await this.prisma.workstation.findUnique({ where: { seatNo } })
    if (dup && dup.id !== id) throw new BadRequestException('办公位编号已存在')

    await this.prisma.workstation.update({
      where: { id },
      data: {
        areaId: area.id,
        seatNo,
        type: payload.type,
        capacity: payload.capacity,
        note: payload.note ?? null,
        defaultMonthlyRent: payload.defaultMonthlyRent ?? null,
        areaSqm: payload.type === 'office' ? payload.areaSqm ?? null : null,
      },
    })
    return { code: 0 }
  }

  async deleteWorkstation(id: string): Promise<{ code: number }> {
    const ws = await this.prisma.workstation.findUnique({ where: { id } })
    if (!ws) throw new NotFoundException('办公位不存在')
    if (ws.status === 'assigned') {
      throw new ConflictException('该办公位已分配企业，请先终止对应租约后再删除')
    }

    /* LeaseWorkstation 关联由 FK onDelete: Cascade 清理（含终止租约的历史归属） */
    await this.prisma.workstation.delete({ where: { id } })
    return { code: 0 }
  }

  async setWorkstationStatus(id: string, status: string): Promise<{ code: number }> {
    const ws = await this.prisma.workstation.findUnique({ where: { id } })
    if (!ws) throw new NotFoundException('办公位不存在')
    if (ws.status === 'assigned') {
      throw new ConflictException('该办公位已分配企业，请先终止对应租约释放办公位')
    }

    await this.prisma.workstation.update({ where: { id }, data: { status } })
    return { code: 0 }
  }

  /* ---------- 租约 ---------- */

  async findLeases(): Promise<LeaseDto[]> {
    const rows = await this.prisma.lease.findMany({
      where: { deletedAt: null },
      include: { workstations: { include: { workstation: true } } },
      orderBy: { id: 'desc' },
    })
    return rows.map(toLeaseDto)
  }

  /** 租约详情（不过滤已归档，供用户记录等入口查看历史租约） */
  async leaseDetail(id: string): Promise<LeaseDto> {
    const row = await this.prisma.lease.findUnique({
      where: { id },
      include: { workstations: { include: { workstation: true } } },
    })
    if (!row) throw new NotFoundException('租约不存在')
    return toLeaseDto(row)
  }

  /** 租约打印单（复用租约详情数据，无新表） */
  async leasePrint(id: string): Promise<Record<string, unknown>> {
    const row = await this.prisma.lease.findFirst({
      where: { id, deletedAt: null },
      include: { workstations: { include: { workstation: true } } },
    })
    if (!row) throw new NotFoundException('租约不存在')
    return {
      title: '聚屿社区 · 办公位租约确认单',
      generatedAt: formatNow(),
      lease: toLeaseDto(row),
      clauses: [
        '本确认单为租赁双方就办公位使用权达成的书面约定，自办公位交付之日起生效。',
        '租金按租赁周期支付，逾期未缴将按社区《办公位管理办法》处理。',
        '如需终止租约，请与空间运营联系办理交接手续，终止后办公位即时释放。',
      ],
    }
  }

  async renterOptions(): Promise<RenterOptionsDto> {
    const [users, enterprises] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { uid: 'asc' } }),
      this.prisma.enterprise.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } }),
    ])
    return {
      users: users.map((u) => ({ uid: u.uid, nickname: u.nickname, phone: u.phone })),
      enterprises: enterprises.map((e) => ({
        id: e.id,
        name: e.name,
        contactName: e.contactName,
        contactPhone: e.contactPhone,
      })),
    }
  }

  async createLease(payload: LeasePayloadDto): Promise<LeaseDto> {
    const renterName = payload.enterpriseName.trim()
    if (!renterName) throw new BadRequestException('请选择或输入租赁方')

    if (payload.renterType === 'enterprise') {
      const enterprise = await this.prisma.enterprise.findFirst({
        where: { id: payload.enterpriseId, deletedAt: null },
      })
      if (!enterprise) throw new BadRequestException('企业不存在')
      if (enterprise.status === 'disabled') throw new BadRequestException('企业已停用不可新增租约')
    }
    if (payload.renterType === 'individual') {
      const user = await this.prisma.user.findUnique({ where: { uid: payload.enterpriseId } })
      if (!user) throw new BadRequestException('用户不存在')
    }

    if (payload.workstationIds.length === 0) throw new BadRequestException('请至少选择一个办公位')

    const targets = await this.prisma.workstation.findMany({
      where: { id: { in: payload.workstationIds } },
    })
    if (targets.length !== payload.workstationIds.length) throw new BadRequestException('存在无效办公位')
    if (targets.some((t) => t.status !== 'idle')) {
      throw new ConflictException('所选办公位中存在已分配或维护中的办公位')
    }

    const id = await this.ids.next('LS')
    await this.prisma.$transaction(async (tx) => {
      await tx.lease.create({
        data: {
          id,
          renterId: payload.enterpriseId,
          renterName,
          renterType: payload.renterType,
          startDate: payload.startDate,
          endDate: payload.longTerm ? '' : payload.endDate,
          longTerm: payload.longTerm,
          status: 'active',
          monthlyRent: payload.monthlyRent,
          rentPeriod: payload.rentPeriod ?? 'month',
          contactName: payload.contactName,
          contactPhone: payload.contactPhone,
        },
      })
      for (const wsId of payload.workstationIds) {
        await tx.leaseWorkstation.create({ data: { leaseId: id, workstationId: wsId } })
      }
      await tx.workstation.updateMany({
        where: { id: { in: payload.workstationIds } },
        data: {
          status: 'assigned',
          enterpriseId: payload.enterpriseId || null,
          enterpriseName: renterName,
          leaseId: id,
        },
      })
    })

    return {
      id,
      enterpriseId: payload.enterpriseId,
      enterpriseName: renterName,
      renterType: payload.renterType,
      workstationIds: payload.workstationIds,
      workstationLabels: targets.map((t) => t.seatNo),
      startDate: payload.startDate,
      endDate: payload.longTerm ? '' : payload.endDate,
      longTerm: payload.longTerm,
      status: 'active',
      monthlyRent: payload.monthlyRent,
      rentPeriod: payload.rentPeriod ?? 'month',
      contactName: payload.contactName,
      contactPhone: payload.contactPhone,
    }
  }

  async updateLease(id: string, payload: LeaseUpdateDto): Promise<{ code: number }> {
    const lease = await this.prisma.lease.findUnique({ where: { id } })
    if (!lease) throw new NotFoundException('租约不存在')
    if (lease.status === 'terminated') throw new ConflictException('已终止租约不可编辑')

    await this.prisma.lease.update({
      where: { id },
      data: {
        startDate: payload.startDate,
        endDate: payload.longTerm ? '' : payload.endDate,
        longTerm: payload.longTerm,
        monthlyRent: payload.monthlyRent,
        rentPeriod: payload.rentPeriod ?? 'month',
        contactName: payload.contactName,
        contactPhone: payload.contactPhone,
      },
    })
    return { code: 0 }
  }

  async terminateLease(id: string): Promise<{ code: number }> {
    const lease = await this.prisma.lease.findFirst({ where: { id, deletedAt: null } })
    if (!lease) throw new NotFoundException('租约不存在')
    if (lease.status === 'terminated') throw new ConflictException('租约已终止')

    const now = formatNow()
    await this.prisma.$transaction(async (tx) => {
      await tx.lease.update({
        where: { id },
        data: { status: 'terminated', terminatedAt: now, archivableAt: now },
      })
      await tx.workstation.updateMany({
        where: { leaseId: id },
        data: { status: 'idle', enterpriseId: null, enterpriseName: null, leaseId: null },
      })
    })
    return { code: 0 }
  }

  async archive(id: string, operator: string): Promise<{ code: number }> {
    const lease = await this.prisma.lease.findFirst({ where: { id, deletedAt: null } })
    if (!lease) throw new NotFoundException('租约不存在')
    if (lease.status !== 'terminated') throw new ConflictException('仅已终止的租约可归档')

    await this.prisma.lease.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '空间管理',
      action: '归档租约',
      target: `${lease.id} · ${lease.renterName}`,
      before: { status: lease.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }
}
