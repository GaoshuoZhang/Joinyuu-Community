import type { User as PrismaUser, UserIdentity } from '@prisma/client'
import type { PrismaService } from '../../common/prisma/prisma.service'
import { normalizeGender } from '../../common/utils/gender'

/* Prisma 基础模型类型不含关系字段，需显式叠加 identities（include 后返回的形状） */
type UserWithIdentities = PrismaUser & { identities: UserIdentity[] }

/* 用户实体 Prisma 行 → User 形状映射（wiki-backend.md §5.2 / apps/admin/src/types/index.ts）
 * 契约：返回与既有契约完全一致（identities 数组按插入序、activities Json 透传、stats 实时派生） */

export interface UserActivity {
  time: string
  content: string
}

export interface UserStats {
  demands: number
  projects: number
  events: number
}

export interface IdentityDto {
  type: string
  enterpriseId?: string
  enterpriseName?: string
  role?: string
  title: string
  level?: number
  experience?: number
}

export interface UserDto {
  uid: string
  /** 登录标识（全站唯一，可修改） */
  username: string
  nickname: string
  phone: string
  email: string
  /** 手机号/邮箱是否为已验证的可信通知渠道 */
  phoneVerified?: boolean
  emailVerified?: boolean
  /** 头像地址（/api/public/files/:key；未设置时缺省） */
  avatar?: string
  gender: string
  status: string
  realName?: string
  citizenId?: string
  wechatOpenid?: string
  wechatUnionid?: string
  wechatVerified?: boolean
  frozenUntil?: string
  frozenReason?: string
  points: number
  registeredAt: string
  lastActiveAt: string
  identities: IdentityDto[]
  bio: string
  stats: UserStats
  activities: UserActivity[]
}

/* 身份映射：可选字段（enterpriseId/enterpriseName/role/level/experience）缺失时省略，而非输出 null */
export function toIdentityDto(identity: UserIdentity): IdentityDto {
  const dto: IdentityDto = { type: identity.type, title: identity.title }
  if (identity.enterpriseId != null) dto.enterpriseId = identity.enterpriseId
  if (identity.enterpriseName != null) dto.enterpriseName = identity.enterpriseName
  if (identity.role != null) dto.role = identity.role
  if (identity.level != null) dto.level = identity.level
  if (identity.experience != null) dto.experience = identity.experience
  return dto
}

/* 用户 stats 实时派生：
 * demands = 发布人 publisherId=uid；projects = 个人承接 or 其社区企业承接；events = 报名记录含该用户 */
export async function computeUserStats(
  prisma: PrismaService,
  uid: string,
  enterpriseIds: string[],
): Promise<UserStats> {
  const [demands, projects, events] = await Promise.all([
    prisma.demand.count({ where: { publisherId: uid, deletedAt: null } }),
    prisma.project.count({
      where: {
        deletedAt: null,
        undertakers: {
          some: {
            OR: [
              { type: 'individual', refId: uid },
              { type: 'enterprise', refId: { in: enterpriseIds } },
            ],
          },
        },
      },
    }),
    prisma.communityEvent.count({ where: { enrollments: { some: { userId: uid } }, deletedAt: null } }),
  ])
  return { demands, projects, events }
}

export function toUserDto(user: UserWithIdentities, stats: UserStats): UserDto {
  const dto: UserDto = {
    uid: user.uid,
    username: user.username,
    nickname: user.nickname,
    phone: user.phone ?? '',
    email: user.email ?? '',
    /* 可信通知渠道标记（后台详情展示用） */
    phoneVerified: Boolean(user.phone && user.phoneVerifiedAt),
    emailVerified: Boolean(user.email && user.emailVerifiedAt),
    gender: normalizeGender(user.gender),
    status: user.status,
    points: user.points,
    registeredAt: user.registeredAt,
    lastActiveAt: user.lastActiveAt,
    identities: user.identities.map(toIdentityDto),
    bio: user.bio,
    stats,
    activities: user.activities as unknown as UserActivity[],
  }
  if (user.avatar != null) dto.avatar = user.avatar
  if (user.realName != null) dto.realName = user.realName
  if (user.citizenId != null) dto.citizenId = user.citizenId
  if (user.wechatOpenid != null) {
    dto.wechatOpenid = user.wechatOpenid
    dto.wechatVerified = user.wechatVerified
  }
  if (user.wechatUnionid != null) dto.wechatUnionid = user.wechatUnionid
  if (user.frozenUntil != null) dto.frozenUntil = user.frozenUntil
  if (user.frozenReason != null) dto.frozenReason = user.frozenReason
  return dto
}

/* 一站式：身份派生企业 ID 列表 → 计算 stats → 组装 UserDto（users/enterprises 模块共用） */
export async function buildUserDto(prisma: PrismaService, user: UserWithIdentities): Promise<UserDto> {
  const enterpriseIds = user.identities
    .filter((i) => i.type === 'community_enterprise' && i.enterpriseId != null)
    .map((i) => i.enterpriseId as string)
  const stats = await computeUserStats(prisma, user.uid, enterpriseIds)
  const dto = toUserDto(user, stats)
  const names = user.identities.filter((row) => row.type === 'external_enterprise' && row.enterpriseName)
    .map((row) => row.enterpriseName as string)
  if (names.length) {
    const profiles = await prisma.externalEnterpriseProfile.findMany({
      where: { name: { in: names }, deletedAt: null }, select: { id: true, name: true },
    })
    dto.identities.forEach((identity) => {
      if (identity.type === 'external_enterprise') {
        const matches = profiles.filter((profile) => profile.name === identity.enterpriseName)
        // 历史同名档案无法可靠区分，避免把用户引向任意一个档案。
        identity.enterpriseId = matches.length === 1 ? matches[0].id : undefined
      }
    })
  }
  return dto
}

/* 批量组装（BE-M7 N+1 修复）：取代逐行 buildUserDto/3 次 count 的逐行查询。
 * 分页场景（pageSize=20）由 61 次查询降为 4 次：3 次 groupBy/聚合 + 1 次关联表投影，内存按 uid 归并。 */
export async function buildUserDtos(prisma: PrismaService, users: UserWithIdentities[]): Promise<UserDto[]> {
  if (users.length === 0) return []
  const uids = users.map((u) => u.uid)

  /* uid → 其关联社区企业 id 列表（企业承接的项目计入该用户；企业 id 空串不当真） */
  const enterpriseIdsByUid = new Map<string, string[]>()
  const allEnterpriseIds = new Set<string>()
  for (const u of users) {
    const ids = u.identities
      .filter((i) => i.type === 'community_enterprise' && i.enterpriseId != null)
      .map((i) => i.enterpriseId as string)
    enterpriseIdsByUid.set(u.uid, ids)
    for (const id of ids) allEnterpriseIds.add(id)
  }
  const entIdList = [...allEnterpriseIds]

  const [demandRows, enrollments, undertakers] = await Promise.all([
    prisma.demand.groupBy({
      by: ['publisherId'],
      where: { publisherId: { in: uids }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.eventEnrollment.findMany({
      where: { userId: { in: uids } },
      select: { eventId: true, userId: true },
    }),
    prisma.projectUndertaker.findMany({
      where: {
        project: { deletedAt: null },
        OR: [
          { type: 'individual', refId: { in: uids } },
          ...(entIdList.length ? [{ type: 'enterprise', refId: { in: entIdList } }] : []),
        ],
      },
      select: { projectId: true, type: true, refId: true },
    }),
  ])

  const demandCount = new Map(demandRows.map((r) => [r.publisherId, r._count._all]))
  /* 报名事件按「去重未删 live 事件」计数，语义与 computeUserStats 的 communityEvent count 一致 */
  const eventIds = [...new Set(enrollments.map((e) => e.eventId))]
  const liveEventIds = eventIds.length
    ? new Set(
        (
          await prisma.communityEvent.findMany({
            where: { id: { in: eventIds }, deletedAt: null },
            select: { id: true },
          })
        ).map((e) => e.id),
      )
    : new Set<string>()
  const eventCount = new Map<string, number>()
  const seenEventsByUid = new Map<string, Set<string>>()
  for (const e of enrollments) {
    if (!liveEventIds.has(e.eventId)) continue
    let seen = seenEventsByUid.get(e.userId)
    if (!seen) {
      seen = new Set()
      seenEventsByUid.set(e.userId, seen)
    }
    seen.add(e.eventId)
  }
  for (const [uid, seen] of seenEventsByUid) eventCount.set(uid, seen.size)
  /* 每个 uid 承接/关联的项目集合（distinct projectId，对齐原 count 语义） */
  const projectsByUid = new Map<string, Set<string>>(uids.map((uid) => [uid, new Set<string>()]))
  for (const t of undertakers) {
    if (t.type === 'individual') {
      projectsByUid.get(t.refId)?.add(t.projectId)
    } else if (t.type === 'enterprise') {
      for (const uid of enterpriseIdsByUid.get(t.refId) ?? []) projectsByUid.get(uid)?.add(t.projectId)
    }
  }

  return users.map((u) =>
    toUserDto(u, {
      demands: demandCount.get(u.uid) ?? 0,
      projects: projectsByUid.get(u.uid)?.size ?? 0,
      events: eventCount.get(u.uid) ?? 0,
    }),
  )
}
