import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { compare, hash } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { IdentityNameService } from '../../../common/identity/identity-name.service'
import { AppSessionService } from '../../../common/app-session/app-session.service'
import { StorageService } from '../../../common/storage/storage.service'
import { formatNow } from '../../../common/utils/time'
import { normalizeGender } from '../../../common/utils/gender'
import { resolveUserPointsDiscount } from '../../../common/points/points-discount'
import type { UpdateMeDto } from './dto/update-me.dto'
import type { ChangePasswordDto } from './dto/change-password.dto'
import type { DeletionRequestDto } from './dto/deletion-request.dto'

/** 身份类型 → 展示标签（经验页 identityLabel 用） */
const IDENTITY_LABEL: Record<string, string> = {
  individual: '个人用户',
  community_individual: '社区个体',
  community_enterprise: '社区企业',
  external_enterprise: '合作企业',
}

/** 注销冷静期（天）：申请后 effectiveAt = requestedAt + 7 天 */
const DELETION_COOLING_DAYS = 7

/** 用户名修改冷却（天）：登录标识每 90 天仅可修改一次 */
const USERNAME_CHANGE_INTERVAL_DAYS = 90

/** 个人中心与账号安全（/api/app/me）：资料聚合、积分/经验流水、改密/换绑、注销与导出 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly notify: NotificationService,
    private readonly identityNames: IdentityNameService,
    private readonly sessions: AppSessionService,
    private readonly storage: StorageService,
  ) {}

  /** 个人中心聚合：资料 + 全部身份 + 积分余额。 */
  async profile(uid: string) {
    const user = await this.prisma.user.findUnique({
      where: { uid },
      include: { identities: { orderBy: { id: 'asc' } } },
    })
    if (!user) throw new NotFoundException('用户不存在')
    /* 积分消费折扣（1 = 1 折 … 10 = 原价）：个人消费按本人社区个体等级，客户端据此展示折后价 */
    const pointsDiscount = await resolveUserPointsDiscount(this.prisma, uid)

    return {
      uid: user.uid,
      username: user.username,
      nickname: user.nickname,
      gender: normalizeGender(user.gender),
      email: user.email,
      phone: user.phone,
      /* 可信通知渠道标记：true=已验证（可用于找回密码/接收通知） */
      emailVerified: Boolean(user.email && user.emailVerifiedAt),
      phoneVerified: Boolean(user.phone && user.phoneVerifiedAt),
      bio: user.bio,
      points: user.points,
      pointsDiscount,
      realName: user.realName ?? undefined,
      status: user.status,
      registeredAt: user.registeredAt,
      avatar: user.avatar ?? undefined,
      /* 新手任务永久隐藏状态：按账号持久化，客户端据此跨浏览器一致地隐藏引导 */
      activationDismissed: user.activationDismissed,
      /* 用户名 90 天限改：null=当前可修改；否则为下次可修改时间（YYYY-MM-DD HH:mm） */
      usernameChangeableAt: this.usernameChangeableAt(user.usernameChangedAt),
      identities: user.identities.map((i) => ({
        type: i.type,
        level: i.level ?? undefined,
        experience: i.experience ?? undefined,
        enterpriseId: i.enterpriseId ?? undefined,
        enterpriseName: i.enterpriseName ?? undefined,
        enterpriseRole: i.role ?? undefined,
        organizationName: i.type === 'external_enterprise' ? i.enterpriseName ?? undefined : undefined,
      })),
    }
  }

  /** 更新资料：用户名/昵称需全站唯一且不得占用保留名；邮箱/手机号变更走专门验证端点。 */
  async updateMe(uid: string, dto: UpdateMeDto): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid } })
    if (!user) throw new NotFoundException('用户不存在')

    const data: Prisma.UserUpdateInput = {}
    const nextUsername = dto.username?.trim()
    /* 用户名仅在真正变更时校验：90 天冷却 + 全站唯一/保留名；同值提交不占用冷却 */
    if (nextUsername && nextUsername !== user.username) {
      const changeableAt = this.usernameChangeableAt(user.usernameChangedAt)
      if (changeableAt) {
        throw new BadRequestException(
          `用户名每 ${USERNAME_CHANGE_INTERVAL_DAYS} 天仅可修改一次，下次可修改时间：${changeableAt}`,
        )
      }
      data.username = await this.identityNames.assertUsernameAvailable(nextUsername, uid)
      data.usernameChangedAt = formatNow()
    }
    if (dto.nickname !== undefined && dto.nickname.trim()) {
      data.nickname = await this.identityNames.assertNicknameAvailable(dto.nickname, uid)
    }
    if (dto.gender !== undefined) data.gender = normalizeGender(dto.gender)
    if (dto.bio !== undefined) data.bio = dto.bio.trim()
    if (dto.avatar !== undefined) data.avatar = dto.avatar.trim() || null

    await this.prisma.user.update({ where: { uid }, data })
    return { code: 0 }
  }

  /** 永久隐藏新手任务（幂等）：按账号持久化，换浏览器/设备后不再显示。 */
  async dismissActivation(uid: string): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid }, select: { uid: true } })
    if (!user) throw new NotFoundException('用户不存在')
    await this.prisma.user.update({ where: { uid }, data: { activationDismissed: true } })
    return { code: 0 }
  }

  /** 我的积分流水（分页倒序，每条含 balance；keyword 匹配事由或来源） */
  async pointsRecords(uid: string, page: number, pageSize: number, keyword?: string) {
    const kw = keyword?.trim()
    const where: Prisma.PointsRecordWhereInput = {
      userId: uid,
      ...(kw ? { OR: [{ reason: { contains: kw } }, { source: { contains: kw } }] } : {}),
    }
    const [total, rows] = await Promise.all([
      this.prisma.pointsRecord.count({ where }),
      this.prisma.pointsRecord.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    return {
      list: rows.map((r) => ({
        id: r.id,
        delta: r.delta,
        balance: r.balance,
        reason: r.reason,
        source: r.source,
        at: r.at,
      })),
      total,
    }
  }

  /** 我的经验与等级（社区个体维度 / 社区企业维度；企业维度需 enterpriseId 定位具体企业） */
  async experienceRecords(uid: string, requestedIdentity?: string, enterpriseId?: string) {
    if (requestedIdentity === 'community_enterprise') {
      return this.enterpriseExperience(uid, enterpriseId)
    }
    const identity = await this.prisma.userIdentity.findFirst({
      where: {
        userId: uid,
        type: 'community_individual',
      },
    })
    if (!identity) {
      return {
        identityLabel: '',
        level: null,
        levelName: '',
        currentExperience: 0,
        currentLevelThreshold: 0,
        nextLevelThreshold: null,
        records: [],
      }
    }

    const experience = identity.experience ?? 0
    const tiers = await this.prisma.levelTier.findMany({ where: { identityType: identity.type }, orderBy: { threshold: 'asc' } })
    const tier = [...tiers].reverse().find((item) => item.threshold <= experience) ?? tiers[0]
    const next = tiers.find((t) => t.threshold > experience)

    const records = await this.prisma.experienceRecord.findMany({
      where: { targetType: 'individual', targetId: uid },
      orderBy: { at: 'desc' },
    })
    return {
      identityLabel: IDENTITY_LABEL[identity.type] || identity.type,
      level: tier?.level ?? identity.level ?? 1,
      levelName: tier?.label ?? '',
      currentExperience: experience,
      currentLevelThreshold: tier?.threshold ?? 0,
      nextLevelThreshold: next?.threshold ?? null,
      records: records.map((r) => ({ id: r.id, delta: r.delta, balance: r.balance, reason: r.reason, at: r.at })),
    }
  }

  /** 社区企业经验与等级（企业详情页等级卡）：enterpriseId 必填且当前用户须为该企业成员。 */
  async enterpriseExperience(uid: string, enterpriseId?: string) {
    const empty = { identityLabel: '', level: null, levelName: '', currentExperience: 0, currentLevelThreshold: 0, nextLevelThreshold: null, records: [] }
    if (!enterpriseId) return empty
    const membership = await this.prisma.userIdentity.findFirst({
      where: { userId: uid, type: 'community_enterprise', enterpriseId },
    })
    if (!membership) throw new ForbiddenException('您不是该企业成员')
    const enterprise = await this.prisma.enterprise.findFirst({ where: { id: enterpriseId, deletedAt: null } })
    if (!enterprise) throw new NotFoundException('企业不存在')

    const experience = enterprise.experience
    const tiers = await this.prisma.levelTier.findMany({ where: { identityType: 'community_enterprise' }, orderBy: { threshold: 'asc' } })
    const tier = [...tiers].reverse().find((item) => item.threshold <= experience) ?? tiers[0]
    const next = tiers.find((t) => t.threshold > experience)
    const records = await this.prisma.experienceRecord.findMany({
      where: { targetType: 'enterprise', targetId: enterpriseId },
      orderBy: { at: 'desc' },
    })
    return {
      identityLabel: IDENTITY_LABEL.community_enterprise,
      enterpriseName: enterprise.name,
      level: tier?.level ?? membership.level ?? 1,
      levelName: tier?.label ?? '',
      currentExperience: experience,
      currentLevelThreshold: tier?.threshold ?? 0,
      nextLevelThreshold: next?.threshold ?? null,
      records: records.map((r) => ({ id: r.id, delta: r.delta, balance: r.balance, reason: r.reason, at: r.at })),
    }
  }

  /** 登录态修改密码：校验原密码 → 更新 → 强制退出全部会话（客户端需重新登录）。 */
  async changePassword(uid: string, dto: ChangePasswordDto): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid } })
    if (!user) throw new UnauthorizedException('未登录或登录已过期')
    if (!user.passwordHash || !(await compare(dto.oldPassword, user.passwordHash))) {
      throw new BadRequestException('原密码不正确')
    }
    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException('新密码不能与原密码相同')
    }
    await this.prisma.user.update({
      where: { uid },
      data: { passwordHash: await hash(dto.newPassword, 10), passwordUpdatedAt: formatNow() },
    })
    /* 需求：修改完密码自动退出登录，需重新登录（全端会话失效，含当前会话） */
    await this.sessions.kickAll(uid)
    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '登录密码已修改',
      content: '您的登录密码已修改成功，请使用新密码重新登录。',
    })
    return { code: 0 }
  }

  /** 提交注销申请：进入 7 天冷静期；已有进行中申请则冲突 */
  async deletionRequest(uid: string, dto: DeletionRequestDto): Promise<{ code: number; effectiveAt: string }> {
    return this.prisma.$transaction(async tx => {
      const [user] = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "User" WHERE uid = ${uid} FOR UPDATE`
      if (!user || user.status === 'deleted') throw new ConflictException('账号已注销')
      const existing = await tx.accountDeletionRequest.findFirst({
        where: { userId: uid, status: 'cooling' },
        select: { id: true },
      })
      if (existing) throw new ConflictException('您已有进行中的注销申请，如需撤销请先取消')

      const requestedAt = formatNow()
      const effectiveAt = this.addDaysTime(requestedAt, DELETION_COOLING_DAYS)
      await tx.accountDeletionRequest.create({
        data: {
          id: await this.ids.next('DR'),
          userId: uid,
          status: 'cooling',
          requestedAt,
          effectiveAt,
          reason: dto.reason?.trim() ?? null,
        },
      })

      await this.notify.pushNoticeInTransaction(tx, uid, {
        type: 'system',
        title: '注销申请已提交',
        content: `您已提交账号注销申请，冷静期于 ${effectiveAt} 届满，之后由工作人员复核执行；执行前可撤回。`,
      })
      return { code: 0, effectiveAt }
    })
  }

  /** 执行前可撤销该用户所有进行中的注销申请；与后台执行共用用户行锁。 */
  async cancelDeletion(uid: string): Promise<{ code: number }> {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT uid FROM "User" WHERE uid = ${uid} FOR UPDATE`
      const changed = await tx.accountDeletionRequest.updateMany({
        where: { userId: uid, status: 'cooling' },
        data: { status: 'cancelled', cancelledAt: formatNow() },
      })
      if (changed.count === 0) throw new BadRequestException('没有可撤销的注销申请')
      await this.notify.pushNoticeInTransaction(tx, uid, {
        type: 'system',
        title: '注销申请已撤销',
        content: '您的账号注销申请已撤销，账户可继续正常使用。',
      })
      return { code: 0 }
    })
  }

  /** 个人数据导出：生成当前服务持有的用户维度 JSON，并通过受控文件端点提供下载。 */
  async dataExport(uid: string): Promise<{ code: number; url: string }> {
    const [user, points, experience, notifications, consents, deletionRequests, demands, articles] = await Promise.all([
      this.prisma.user.findUnique({ where: { uid }, include: { identities: true, enrollments: true, reservations: true, orders: true } }),
      this.prisma.pointsRecord.findMany({ where: { userId: uid }, orderBy: { at: 'asc' } }),
      this.prisma.experienceRecord.findMany({ where: { targetId: uid }, orderBy: { at: 'asc' } }),
      this.prisma.userNotification.findMany({ where: { userId: uid }, orderBy: { at: 'asc' } }),
      this.prisma.agreementConsent.findMany({ where: { userId: uid }, orderBy: { consentedAt: 'asc' } }),
      this.prisma.accountDeletionRequest.findMany({ where: { userId: uid }, orderBy: { requestedAt: 'asc' } }),
      this.prisma.demand.findMany({ where: { publisherId: uid }, orderBy: { createdAt: 'asc' } }),
      this.prisma.article.findMany({ where: { authorId: uid }, orderBy: { createdAt: 'asc' } }),
    ])
    if (!user) throw new NotFoundException('用户不存在')
    const generatedAt = formatNow()
    const safeStamp = generatedAt.replace(/[- :]/g, '')
    /* 键名追加随机段：即使同秒并发生成也不会互相覆盖，且不依赖 uid+时间戳的可枚举性 */
    const key = `export-${uid}-${safeStamp}-${randomUUID().slice(0, 8)}.json`
    const { citizenId, ...safeUser } = user
    const payload = {
      generatedAt,
      user: { ...safeUser, passwordHash: undefined, citizenId: citizenId ? `${citizenId.slice(0, 4)}**********${citizenId.slice(-4)}` : null },
      points,
      experience,
      notifications,
      consents,
      deletionRequests,
      demands,
      articles,
    }
    await this.storage.put(key, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'), 'application/json')
    const url = `/api/app/me/data-exports/${key}`
    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '个人数据导出已生成',
      content: '您的个人数据导出已生成，点击查看或下载。',
      link: url,
    })
    return { code: 0, url }
  }

  async accountRequests(uid: string) {
    const [deletion, exported] = await Promise.all([
      this.prisma.accountDeletionRequest.findFirst({ where: { userId: uid, status: 'cooling' }, orderBy: { requestedAt: 'desc' } }),
      this.prisma.userNotification.findFirst({ where: { userId: uid, title: '个人数据导出已生成' }, orderBy: { at: 'desc' } }),
    ])
    return {
      deletion: deletion ? { reason: deletion.reason ?? undefined, at: deletion.requestedAt, cancelableUntil: deletion.effectiveAt ?? undefined } : undefined,
      export: exported ? { at: exported.at, url: exported.link ?? undefined } : undefined,
    }
  }

  async readExport(uid: string, key: string): Promise<Buffer | null> {
    if (!key.startsWith(`export-${uid}-`) || !key.endsWith('.json')) return null
    /* 与公开文件路由同口径：拒绝任何含路径分隔/穿越的键 */
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key) || key.includes('..')) return null
    return this.storage.read(key)
  }

  /* ---------- 内部工具 ---------- */

  /** 用户名锁定状态：返回下次可修改时间（YYYY-MM-DD HH:mm）；从未修改或已满冷却期返回 null */
  private usernameChangeableAt(changedAt: string | null): string | null {
    if (!changedAt) return null
    const next = this.addDaysTime(changedAt, USERNAME_CHANGE_INTERVAL_DAYS)
    return new Date(next.replace(' ', 'T')).getTime() <= Date.now() ? null : next
  }

  /** 时间字符串（YYYY-MM-DD HH:mm）加天数 */
  private addDaysTime(timeStr: string, days: number): string {
    const d = new Date(timeStr.replace(' ', 'T'))
    d.setDate(d.getDate() + days)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
}
