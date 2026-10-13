import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { hash } from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { buildUserDto, buildUserDtos, type UserDto } from './user.mapper'
import type { QueryUsersDto } from './dto/query-users.dto'
import type { QueryIndividualsDto } from './dto/query-individuals.dto'
import type { FreezeUserDto } from './dto/freeze-user.dto'
import type { UpdateUserDto } from './dto/update-user.dto'
import type { CreateUserDto } from './dto/create-user.dto'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { formatNow, formatToday } from '../../common/utils/time'
import { normalizeGender } from '../../common/utils/gender'
import { NotificationService } from '../../common/notify/notification.service'
import { IdentityNameService } from '../../common/identity/identity-name.service'
import { AppSessionService } from '../../common/app-session/app-session.service'
import type { ReviewDeletionDto } from './dto/review-member-governance.dto'

/* 用户与社区个体域：读多写少（冻结为写），stats 实时派生（wiki-backend.md §7.2） */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ids: IdGeneratorService,
    private readonly notify: NotificationService,
    private readonly identityNames: IdentityNameService,
    private readonly sessions: AppSessionService,
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

    const list = await buildUserDtos(this.prisma, rows)
    return { list, total }
  }

  async create(dto: CreateUserDto, operator: string): Promise<{ id: string }> {
    const nickname = dto.nickname.trim()
    const phone = dto.phone.trim()
    const email = (dto.email ?? '').trim().toLowerCase()
    if (!nickname) throw new BadRequestException('请输入昵称')
    if (!phone) throw new BadRequestException('请输入联系电话')

    /* 用户名：留空自动分配；昵称/手机号/邮箱均全站唯一 */
    const username = dto.username?.trim()
      ? await this.identityNames.assertUsernameAvailable(dto.username)
      : await this.identityNames.assignUsername()
    await this.identityNames.assertNicknameAvailable(nickname)
    if (await this.prisma.user.findUnique({ where: { phone }, select: { uid: true } })) {
      throw new ConflictException('该联系电话已被其他用户使用')
    }
    if (email && (await this.prisma.user.findUnique({ where: { email }, select: { uid: true } }))) {
      throw new ConflictException('该邮箱已被其他用户使用')
    }

    const uid = await this.ids.next('U')
    const realName = dto.realName?.trim() || null
    const citizenId = dto.citizenId?.trim() || null
    const now = formatNow()
    await this.prisma.user.create({
      data: {
        uid,
        username,
        nickname,
        phone,
        email: email || null,
        /* 后台代录的联系方式视为可信通知渠道（否则该账号无法找回密码） */
        phoneVerifiedAt: now,
        emailVerifiedAt: email ? now : null,
        gender: normalizeGender(dto.gender),
        realName,
        citizenId,
        verifiedAt: realName && citizenId ? now : null,
        registeredAt: formatToday(),
        lastActiveAt: now,
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
    if (user.status === 'deleted') throw new ConflictException('已注销账号不可重置密码')
    const next = (password ?? '').trim()
    if (next.length < 8) throw new BadRequestException('密码至少 8 位')

    await this.prisma.user.update({
      where: { uid: id },
      data: { passwordHash: await hash(next, 10), passwordUpdatedAt: formatNow() },
    })
    /* BE-M5：重置后踢出全部会话，旧 JWT 立即失效（对齐 me.service 改密行为） */
    await this.sessions.kickAll(id)

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

    const list = await buildUserDtos(this.prisma, rows)
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
        where: {
          deletedAt: null,
          OR: [
            { userId: id },
            ...(user.phone ? [{ userId: null, applicantPhone: user.phone }] : []),
          ],
        },
        orderBy: { submittedAt: 'desc' },
        select: { id: true, type: true, targetName: true, status: true, submittedAt: true, summary: true, deletedAt: true },
      }),
      this.prisma.demand.findMany({
        where: { publisherId: id },
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
    if (user.status === 'deleted') throw new ConflictException('已注销账号不可编辑')

    /* 仅更新传入字段；用户名/昵称/手机号/邮箱全站唯一，忽略空串 */
    const data: Prisma.UserUpdateInput = {}
    const changed: string[] = []
    if (dto.username !== undefined && dto.username.trim()) {
      data.username = await this.identityNames.assertUsernameAvailable(dto.username, id)
      changed.push('用户名')
    }
    if (dto.nickname !== undefined && dto.nickname.trim()) {
      data.nickname = await this.identityNames.assertNicknameAvailable(dto.nickname, id)
      changed.push('昵称')
    }
    if (dto.phone !== undefined && dto.phone.trim()) {
      const phone = dto.phone.trim()
      const owner = await this.prisma.user.findUnique({ where: { phone }, select: { uid: true } })
      if (owner && owner.uid !== id) throw new ConflictException('该联系电话已被其他用户使用')
      data.phone = phone
      data.phoneVerifiedAt = formatNow()
      changed.push('手机号')
    }
    if (dto.email !== undefined && dto.email.trim()) {
      const email = dto.email.trim().toLowerCase()
      const owner = await this.prisma.user.findUnique({ where: { email }, select: { uid: true } })
      if (owner && owner.uid !== id) throw new ConflictException('该邮箱已被其他用户使用')
      data.email = email
      data.emailVerifiedAt = formatNow()
      changed.push('邮箱')
    }
    if (dto.gender !== undefined && dto.gender.trim()) {
      data.gender = normalizeGender(dto.gender)
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
    if (dto.realName !== undefined || dto.citizenId !== undefined) {
      const realName = dto.realName !== undefined ? dto.realName.trim() : user.realName
      const citizenId = dto.citizenId !== undefined ? dto.citizenId.trim() : user.citizenId
      data.verifiedAt = realName && citizenId ? formatNow() : null
    }
    if (dto.bio !== undefined) {
      data.bio = dto.bio.trim()
      changed.push('简介')
    }
    if (dto.avatar !== undefined) {
      const avatar = dto.avatar.trim()
      /* 仅接受站内相对路径或 http(s) 绝对地址（后台由素材上传回填），避免写入任意字符串 */
      if (avatar && !/^(https?:\/\/|\/)/.test(avatar)) throw new BadRequestException('头像地址不合法')
      data.avatar = avatar || null
      changed.push(avatar ? '头像' : '头像（清除）')
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

  async updateStatus(id: string, status: 'active' | 'frozen', operator?: string): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid: id } })
    if (!user) throw new NotFoundException('用户不存在')
    if (user.status === 'deleted') throw new ConflictException('已注销账号不可恢复')

    if (status !== 'active') {
      /* 冻结必须走 freeze 接口（校验冻结期限/长期开关与原因），防止绕过校验直接置 frozen */
      throw new BadRequestException('冻结账号请使用冻结功能，并提供冻结期限与原因')
    }

    await this.prisma.user.update({
      where: { uid: id },
      data: { status: 'active', frozenUntil: null, frozenReason: null },
    })

    /* 解冻留痕：与 freeze 对称，避免冻结解除无记录可追溯 */
    await this.audit.record({
      module: '社区成员',
      action: '解冻账号',
      target: `${user.uid} · ${user.nickname}`,
      detail: user.frozenReason ?? '解除冻结',
      before: { status: user.status, frozenUntil: user.frozenUntil ?? null },
      after: { status: 'active', frozenUntil: null },
      operator: operator ?? '社区管理员',
    })
    return { code: 0 }
  }

  async freeze(id: string, dto: FreezeUserDto, operator: string): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid: id } })
    if (!user) throw new NotFoundException('用户不存在')
    if (user.status === 'deleted') throw new ConflictException('已注销账号不可冻结')
    if (user.status === 'frozen') throw new ConflictException('该账号已处于冻结状态')
    if (!dto.permanent && !dto.until) throw new BadRequestException('请选择冻结期限或开启长期冻结')
    const reason = (dto.reason ?? '').trim()
    if (!reason) throw new BadRequestException('请填写冻结原因')
    /* 期限必须是晚于当前时间的合法时间串，避免误传过去时间/垃圾串导致冻结实际已过期 */
    const frozenUntil = dto.permanent ? null : normalizeFrozenUntil(dto.until)

    await this.prisma.user.update({
      where: { uid: id },
      data: {
        status: 'frozen',
        frozenUntil,
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
        frozenUntil,
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

  async deletionRequests(page: number, pageSize: number, status?: string) {
    const where: Prisma.AccountDeletionRequestWhereInput = status ? { status } : {}
    const [total, rows] = await Promise.all([
      this.prisma.accountDeletionRequest.count({ where }),
      this.prisma.accountDeletionRequest.findMany({
        where,
        include: { user: { select: { uid: true, nickname: true, phone: true, status: true } } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return { list: rows, total }
  }

  async reviewDeletion(id: string, dto: ReviewDeletionDto, operator: string): Promise<{ code: number }> {
    const note = dto.note.trim()
    if (!note) throw new BadRequestException('请填写复核说明')
    const request = await this.prisma.accountDeletionRequest.findUnique({ where: { id }, include: { user: true } })
    if (!request) throw new NotFoundException('注销申请不存在')
    if (request.status !== 'cooling') throw new ConflictException('该注销申请已处理')
    if (dto.action === 'approve' && request.effectiveAt && request.effectiveAt > formatNow()) {
      throw new ConflictException('注销申请仍在冷静期内')
    }
    const now = formatNow()
    await this.prisma.$transaction(async tx => {
      const [user] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "User" WHERE uid = ${request.userId} FOR UPDATE`
      if (!user || user.status === 'deleted') throw new ConflictException('账号已注销')
      const changed = await tx.accountDeletionRequest.updateMany({
        where: { id, status: 'cooling' },
        data: dto.action === 'approve'
          ? { status: 'approved', approvedAt: now, reviewedAt: now, reviewedBy: operator, reviewNote: note }
          : { status: 'rejected', cancelledAt: now, cancelReason: note, reviewedAt: now, reviewedBy: operator, reviewNote: note },
      })
      if (changed.count !== 1) throw new ConflictException('该注销申请已处理')
      if (dto.action === 'approve') {
        await tx.user.update({
          where: { uid: request.userId },
          data: {
            status: 'deleted',
            /* 昵称全站唯一：注销占位名带上 uid，避免多个注销账号互相冲突 */
            nickname: `已注销用户_${request.userId}`,
            /* 手机号/邮箱唯一：注销后置为占位值以释放原值 */
            phone: `deleted:${request.userId}`,
            email: null,
            phoneVerifiedAt: null,
            emailVerifiedAt: null,
            realName: null,
            citizenId: null,
            verifiedAt: null,
            passwordHash: null,
            avatar: null,
            bio: '',
          },
        })
      } else {
        await this.notify.pushNoticeInTransaction(tx, request.userId, {
          type: 'system', title: '注销申请未通过', content: note, link: '/me/security',
        })
      }
    })
    if (dto.action === 'approve') await this.sessions.kickAll(request.userId)
    await this.audit.record({
      module: '社区成员', action: dto.action === 'approve' ? '确认账号注销' : '驳回账号注销',
      target: `${request.userId} · ${request.user.nickname}`, detail: note, operator,
    })
    return { code: 0 }
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

/** 冻结期限归一化：仅日期按当日 23:59 处理；格式非法或早于当前时间抛 400（与调度任务的字符串比较同口径） */
function normalizeFrozenUntil(raw?: string): string {
  const value = (raw ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(value)) {
    throw new BadRequestException('冻结期限格式应为 YYYY-MM-DD HH:mm')
  }
  const normalized = value.length === 10 ? `${value} 23:59` : value
  if (normalized <= formatNow()) throw new BadRequestException('冻结期限必须晚于当前时间')
  return normalized
}
