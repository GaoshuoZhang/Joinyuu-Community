import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { hash } from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { buildUserDto, type UserDto } from './user.mapper'
import type { QueryUsersDto } from './dto/query-users.dto'
import type { QueryIndividualsDto } from './dto/query-individuals.dto'
import type { FreezeUserDto } from './dto/freeze-user.dto'
import type { UpdateUserDto } from './dto/update-user.dto'
import type { CreateUserDto } from './dto/create-user.dto'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { formatNow, formatToday } from '../../common/utils/time'

/* 用户与社区个体域：读多写少（冻结为写），stats 实时派生（wiki-backend.md §7.2） */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ids: IdGeneratorService,
  ) {}

  async list(query: QueryUsersDto): Promise<{ list: UserDto[]; total: number }> {
    const where = this.buildUsersWhere(query)

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { identities: { orderBy: { id: 'asc' } } },
        orderBy: { uid: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])

    const list = await Promise.all(rows.map((u) => buildUserDto(this.prisma, u)))
    return { list, total }
  }

  async create(dto: CreateUserDto, operator: string): Promise<{ id: string }> {
    const nickname = dto.nickname.trim()
    const phone = dto.phone.trim()
    const email = dto.email.trim()
    if (!nickname) throw new BadRequestException('请输入昵称')
    if (!phone) throw new BadRequestException('请输入联系电话')
    if (!email) throw new BadRequestException('请输入邮箱')

    const existing = await this.prisma.user.findFirst({ where: { phone }, select: { uid: true } })
    if (existing) throw new ConflictException('该联系电话已被其他用户使用')

    const uid = await this.ids.next('U')
    await this.prisma.user.create({
      data: {
        uid,
        nickname,
        phone,
        email,
        gender: dto.gender,
        realName: dto.realName?.trim() || null,
        citizenId: dto.citizenId?.trim() || null,
        registeredAt: formatToday(),
        lastActiveAt: formatNow(),
        bio: dto.bio?.trim() ?? '',
        identities: {
          create: { type: 'individual', title: '个人用户' },
        },
      },
    })

    await this.audit.record({
      module: '社区成员',
      action: '新增用户',
      target: `${uid} · ${nickname}`,
      detail: `联系电话：${phone}`,
      operator,
    })
    return { id: uid }
  }

  /* 管理员强制重置用户登录密码：直接覆盖当前密码，写审计（不可撤销） */
  async resetPassword(id: string, password: string, operator: string): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid: id } })
    if (!user) throw new NotFoundException('用户不存在')
    const next = (password ?? '').trim()
    if (next.length < 8) throw new BadRequestException('密码至少 8 位')

    await this.prisma.user.update({
      where: { uid: id },
      data: { passwordHash: await hash(next, 10), passwordUpdatedAt: formatNow() },
    })

    await this.audit.record({
      module: '社区成员',
      action: '重置密码',
      target: `${user.uid} · ${user.nickname}`,
      detail: '管理员强制重置登录密码',
      operator,
    })
    return { code: 0 }
  }

  async listIndividuals(query: QueryIndividualsDto): Promise<{ list: UserDto[]; total: number }> {
    const conditions: Prisma.UserWhereInput[] = [
      { identities: { some: { type: 'community_individual' } } },
    ]
    if (query.keyword) {
      const kw = query.keyword.trim()
      conditions.push({
        OR: [
          { nickname: { contains: kw, mode: 'insensitive' } },
          { uid: { contains: kw, mode: 'insensitive' } },
          { phone: { contains: kw } },
        ],
      })
    }
    if (query.status) conditions.push({ status: query.status })

    const where: Prisma.UserWhereInput = { AND: conditions }

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { identities: { orderBy: { id: 'asc' } } },
        orderBy: { uid: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])

    const list = await Promise.all(rows.map((u) => buildUserDto(this.prisma, u)))
    return { list, total }
  }

  async detail(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { uid: id },
      include: { identities: { orderBy: { id: 'asc' } } },
    })
    if (!user) throw new NotFoundException('用户不存在')
    return buildUserDto(this.prisma, user)
  }

  /* 用户记录聚合（用户详情「记录」标签页）：7 域按用户维度过滤；含已归档条目（deletedAt 非空，前端展示「已归档」状态） */
  async records(id: string): Promise<Record<string, unknown[]>> {
    const user = await this.prisma.user.findUnique({
      where: { uid: id },
      include: { identities: true },
    })
    if (!user) throw new NotFoundException('用户不存在')
    const enterpriseIds = user.identities
      .filter((i) => i.type === 'community_enterprise' && i.enterpriseId != null)
      .map((i) => i.enterpriseId as string)

    const [applications, demands, projects, events, leases, submissions, reservations] = await Promise.all([
      this.prisma.application.findMany({
        where: { applicantPhone: user.phone },
        orderBy: { submittedAt: 'desc' },
        select: { id: true, type: true, targetName: true, status: true, submittedAt: true, summary: true, deletedAt: true },
      }),
      this.prisma.demand.findMany({
        where: { OR: [{ creatorId: id }, { publisherId: id }] },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, createdAt: true, deletedAt: true },
      }),
      this.prisma.project.findMany({
        where: {
          undertakers: {
            some: {
              OR: [
                { type: 'individual', refId: id },
                { type: 'enterprise', refId: { in: enterpriseIds } },
              ],
            },
          },
        },
        orderBy: { initiatedAt: 'desc' },
        select: { id: true, name: true, code: true, status: true, initiatedAt: true, deletedAt: true },
      }),
      this.prisma.communityEvent.findMany({
        where: { enrollments: { some: { userId: id } } },
        orderBy: { startTime: 'desc' },
        select: { id: true, title: true, status: true, startTime: true, endTime: true, deletedAt: true },
      }),
      this.prisma.lease.findMany({
        where: {
          OR: [
            { renterType: 'individual', renterId: id },
            ...(enterpriseIds.length
              ? [{ renterType: 'enterprise', renterId: { in: enterpriseIds } }]
              : []),
          ],
        },
        orderBy: { startDate: 'desc' },
        select: {
          id: true,
          renterName: true,
          status: true,
          startDate: true,
          endDate: true,
          longTerm: true,
          terminatedAt: true,
          deletedAt: true,
        },
      }),
      this.prisma.article.findMany({
        where: { channel: 'submitted', authorId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, createdAt: true, publishedAt: true, deletedAt: true },
      }),
      this.prisma.spaceReservation.findMany({
        where: { userId: id },
        orderBy: { submittedAt: 'desc' },
        select: { id: true, spaceName: true, date: true, startTime: true, endTime: true, status: true, deletedAt: true },
      }),
    ])
    return { applications, demands, projects, events, leases, submissions, reservations }
  }

  async update(id: string, dto: UpdateUserDto, operator: string): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid: id } })
    if (!user) throw new NotFoundException('用户不存在')

    /* 仅更新传入字段；昵称/手机号/邮箱/性别忽略空串，实名/证件号/简介允许清空 */
    const data: Prisma.UserUpdateInput = {}
    const changed: string[] = []
    if (dto.nickname !== undefined && dto.nickname.trim()) {
      data.nickname = dto.nickname.trim()
      changed.push('昵称')
    }
    if (dto.phone !== undefined && dto.phone.trim()) {
      data.phone = dto.phone.trim()
      changed.push('手机号')
    }
    if (dto.email !== undefined && dto.email.trim()) {
      data.email = dto.email.trim()
      changed.push('邮箱')
    }
    if (dto.gender !== undefined && dto.gender.trim()) {
      data.gender = dto.gender.trim()
      changed.push('性别')
    }
    if (dto.realName !== undefined) {
      data.realName = dto.realName.trim()
      changed.push('真实姓名')
    }
    if (dto.citizenId !== undefined) {
      data.citizenId = dto.citizenId.trim()
      changed.push('证件号')
    }
    if (dto.bio !== undefined) {
      data.bio = dto.bio.trim()
      changed.push('简介')
    }

    await this.prisma.user.update({ where: { uid: id }, data })

    await this.audit.record({
      module: '社区成员',
      action: '编辑用户信息',
      target: id,
      detail: `更新资料：${changed.join('/')}`,
      operator,
    })
    return { code: 0 }
  }

  async updateStatus(id: string, status: 'active' | 'frozen'): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid: id } })
    if (!user) throw new NotFoundException('用户不存在')

    if (status !== 'active') {
      /* 冻结必须走 freeze 接口（校验冻结期限/长期开关与原因），防止绕过校验直接置 frozen */
      throw new BadRequestException('冻结账号请使用冻结功能，并提供冻结期限与原因')
    }

    await this.prisma.user.update({
      where: { uid: id },
      data: { status: 'active', frozenUntil: null, frozenReason: null },
    })
    return { code: 0 }
  }

  async freeze(id: string, dto: FreezeUserDto, operator: string): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid: id } })
    if (!user) throw new NotFoundException('用户不存在')
    if (user.status === 'frozen') throw new ConflictException('该账号已处于冻结状态')
    if (!dto.permanent && !dto.until) throw new BadRequestException('请选择冻结期限或开启长期冻结')
    const reason = (dto.reason ?? '').trim()
    if (!reason) throw new BadRequestException('请填写冻结原因')

    await this.prisma.user.update({
      where: { uid: id },
      data: {
        status: 'frozen',
        frozenUntil: dto.permanent ? null : (dto.until ?? null),
        frozenReason: reason,
      },
    })

    await this.audit.record({
      module: '社区成员',
      action: '冻结账号',
      target: `${user.uid} · ${user.nickname}`,
      detail: reason,
      before: { status: user.status },
      after: {
        status: 'frozen',
        permanent: dto.permanent,
        frozenUntil: dto.permanent ? null : (dto.until ?? null),
        frozenReason: reason,
      },
      operator,
    })
    return { code: 0 }
  }

  async options(): Promise<Array<{ label: string; value: string }>> {
    const users = await this.prisma.user.findMany({
      orderBy: { uid: 'asc' },
      select: { uid: true, nickname: true },
    })
    return users.map((u) => ({ label: `${u.nickname}（${u.uid}）`, value: u.uid }))
  }

  private buildUsersWhere(query: QueryUsersDto): Prisma.UserWhereInput {
    const conditions: Prisma.UserWhereInput[] = []
    if (query.keyword) {
      const kw = query.keyword.trim()
      conditions.push({
        OR: [
          { nickname: { contains: kw, mode: 'insensitive' } },
          { uid: { contains: kw, mode: 'insensitive' } },
          { phone: { contains: kw } },
        ],
      })
    }
    if (query.status) conditions.push({ status: query.status })
    if (query.realStatus === 'verified') {
      conditions.push({ realName: { not: null }, citizenId: { not: null } })
    } else if (query.realStatus === 'unverified') {
      conditions.push({ OR: [{ realName: null }, { citizenId: null }] })
    }
    if (query.category === 'individual') {
      conditions.push({ identities: { none: { type: { not: 'individual' } } } })
    } else if (query.category) {
      conditions.push({ identities: { some: { type: query.category } } })
    }
    return conditions.length ? { AND: conditions } : {}
  }
}
