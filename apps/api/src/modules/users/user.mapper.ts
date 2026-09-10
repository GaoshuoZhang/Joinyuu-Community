import type { User as PrismaUser, UserIdentity } from '@prisma/client'
import type { PrismaService } from '../../common/prisma/prisma.service'

/* Prisma 基础模型类型不含关系字段，需显式叠加 identities（include 后返回的形状） */
type UserWithIdentities = PrismaUser & { identities: UserIdentity[] }

/* 用户实体 Prisma 行 → M0 User 形状映射（wiki-backend.md §5.2 / apps/admin/src/types/index.ts）
 * 契约：返回与 M0 mock 完全一致（identities 数组按插入序、activities Json 透传、stats 实时派生） */

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
  nickname: string
  phone: string
  email: string
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

/* 身份映射：M0 可选字段（enterpriseId/enterpriseName/role/level/experience）缺失时省略，而非输出 null */
export function toIdentityDto(identity: UserIdentity): IdentityDto {
  const dto: IdentityDto = { type: identity.type, title: identity.title }
  if (identity.enterpriseId != null) dto.enterpriseId = identity.enterpriseId
  if (identity.enterpriseName != null) dto.enterpriseName = identity.enterpriseName
  if (identity.role != null) dto.role = identity.role
  if (identity.level != null) dto.level = identity.level
  if (identity.experience != null) dto.experience = identity.experience
  return dto
}

/* 用户 stats 实时派生（与 M0 fetchUser 口径一致）：
 * demands = 发布人 publisherId=uid；projects = 个人承接 or 其社区企业承接；events = 报名记录含该用户 */
export async function computeUserStats(
  prisma: PrismaService,
  uid: string,
  enterpriseIds: string[],
): Promise<UserStats> {
  const [demands, projects, events] = await Promise.all([
    prisma.demand.count({ where: { publisherId: uid } }),
    prisma.project.count({
      where: {
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
    prisma.communityEvent.count({ where: { enrollments: { some: { userId: uid } } } }),
  ])
  return { demands, projects, events }
}

export function toUserDto(user: UserWithIdentities, stats: UserStats): UserDto {
  const dto: UserDto = {
    uid: user.uid,
    nickname: user.nickname,
    phone: user.phone,
    email: user.email,
    gender: user.gender,
    status: user.status,
    points: user.points,
    registeredAt: user.registeredAt,
    lastActiveAt: user.lastActiveAt,
    identities: user.identities.map(toIdentityDto),
    bio: user.bio,
    stats,
    activities: user.activities as unknown as UserActivity[],
  }
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
  return toUserDto(user, stats)
}
