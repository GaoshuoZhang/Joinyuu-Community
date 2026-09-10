import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { buildUserDto, type UserDto } from './user.mapper'
import type { QueryUsersDto } from './dto/query-users.dto'
import type { QueryIndividualsDto } from './dto/query-individuals.dto'
import type { FreezeUserDto } from './dto/freeze-user.dto'

/* 用户与社区个体域：读多写少（冻结为写），stats 实时派生（wiki-backend.md §7.2） */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
