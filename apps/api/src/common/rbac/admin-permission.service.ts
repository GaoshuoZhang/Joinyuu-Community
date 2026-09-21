import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

const CACHE_PREFIX = 'auth:admin:perms:'
const SCOPE_PREFIX = 'auth:admin:scopes:'
/** 账号可访问性画像缓存键（供守卫判定「账号是否存在/启用/超管/是否已分配角色」） */
const PROFILE_PREFIX = 'auth:admin:profile:'
/** 权限缓存 TTL（5min，BE-M9：由 2h 缩短，失效失败容错期内最短化） */
const CACHE_TTL = 5 * 60
/** 访问画像 TTL（60s）：停用/降权后最迟 1 分钟内生效，避免长窗口越权 */
const PROFILE_TTL = 60

/** 管理员访问画像：明确区分「账号无效」与「无权限」，避免把空集合当成「不受限」 */
export interface AdminAccessProfile {
  /** 账号是否存在 */
  exists: boolean
  /** 账号是否为启用状态 */
  active: boolean
  /** 是否持有 '*' 全量权限（超管） */
  super: boolean
  /** 是否已分配角色（未分配角色 = 无任何数据范围，须拒绝而非放行） */
  hasRoles: boolean
  /** 权限码集合 */
  codes: string[]
  /** 数据范围域集合（超管恒为空 = 不限制） */
  scopes: string[]
}

/* RBAC 权限装载：按管理员角色聚合权限码集合与数据范围。
 * '*' 表示超级管理员全量；Redis 缓存，角色/账号变更时主动失效（改角色即时生效）。 */
@Injectable()
export class AdminPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 管理员访问画像（守卫统一入口）：存在性 + 启用状态 + 超管 + 角色 + 权限码 + 数据范围 */
  async getAccessProfile(username: string): Promise<AdminAccessProfile> {
    const cached = await this.redis.getCache<AdminAccessProfile>(PROFILE_PREFIX + username)
    if (cached) return cached
    const profile = await this.computeProfile(username)
    await this.redis.setCache(PROFILE_PREFIX + username, profile, PROFILE_TTL)
    return profile
  }

  /** 管理员权限码集合（缓存优先；未命中回源 DB） */
  async getPermCodes(username: string): Promise<string[]> {
    const cached = await this.redis.getCache<string[]>(CACHE_PREFIX + username)
    if (cached) return cached
    const codes = await this.compute(username)
    await this.redis.setCache(CACHE_PREFIX + username, codes, CACHE_TTL)
    return codes
  }

  /** 管理员数据范围域集合（缓存优先；未命中回源 DB）；空数组 = 不限制全部域 */
  async getScopeCodes(username: string): Promise<string[]> {
    const cached = await this.redis.getCache<string[]>(SCOPE_PREFIX + username)
    if (cached) return cached
    const scopes = await this.computeScopes(username)
    await this.redis.setCache(SCOPE_PREFIX + username, scopes, CACHE_TTL)
    return scopes
  }

  /** 单个管理员缓存失效（改角色 / 停用 / 重置密码）
   * BE-M9：失效失败抛 503（fail-closed）——权限缓存未清除即继续放行会放大越权窗口 */
  async invalidate(username: string): Promise<void> {
    await this.redis.delCacheStrict(
      CACHE_PREFIX + username,
      SCOPE_PREFIX + username,
      PROFILE_PREFIX + username,
    )
  }

  /** 角色权限/数据范围变更后，失效所有关联该角色的管理员缓存 */
  async invalidateByRole(roleId: string): Promise<void> {
    const links = await this.prisma.adminUserRole.findMany({ where: { roleId } })
    if (links.length === 0) return
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: links.map((l) => l.adminUserId) } },
      select: { username: true },
    })
    await this.redis.delCacheStrict(
      ...admins.flatMap((a) => [
        CACHE_PREFIX + a.username,
        SCOPE_PREFIX + a.username,
        PROFILE_PREFIX + a.username,
      ]),
    )
  }

  private async computeProfile(username: string): Promise<AdminAccessProfile> {
    const invalid: AdminAccessProfile = {
      exists: false, active: false, super: false, hasRoles: false, codes: [], scopes: [],
    }
    const admin = await this.prisma.adminUser.findUnique({ where: { username } })
    if (!admin) return invalid
    if (admin.status !== 'active') return { ...invalid, exists: true }
    const links = await this.prisma.adminUserRole.findMany({ where: { adminUserId: admin.id } })
    if (links.length === 0) return { ...invalid, exists: true, active: true }
    const roleIds = links.map((l) => l.roleId)
    const rows = await this.prisma.adminRolePermission.findMany({
      where: { roleId: { in: roleIds } },
    })
    const codes = [...new Set(rows.map((r) => r.permissionCode))]
    const isSuper = codes.includes('*')
    let scopes: string[] = []
    if (!isSuper) {
      const roles = await this.prisma.adminRole.findMany({ where: { id: { in: roleIds } } })
      scopes = [...new Set(roles.flatMap((r) => r.dataScope))]
    }
    return { exists: true, active: true, super: isSuper, hasRoles: true, codes, scopes }
  }

  private async compute(username: string): Promise<string[]> {
    const admin = await this.prisma.adminUser.findUnique({ where: { username } })
    if (!admin || admin.status !== 'active') return []
    const links = await this.prisma.adminUserRole.findMany({ where: { adminUserId: admin.id } })
    if (links.length === 0) return []
    const rows = await this.prisma.adminRolePermission.findMany({
      where: { roleId: { in: links.map((l) => l.roleId) } },
    })
    return [...new Set(rows.map((r) => r.permissionCode))]
  }

  private async computeScopes(username: string): Promise<string[]> {
    const admin = await this.prisma.adminUser.findUnique({ where: { username } })
    if (!admin || admin.status !== 'active') return []
    const links = await this.prisma.adminUserRole.findMany({ where: { adminUserId: admin.id } })
    if (links.length === 0) return []
    const roleIds = links.map((l) => l.roleId)
    /* 任一角色为超管（权限含 '*'）→ 不限制数据范围 */
    const superGrant = await this.prisma.adminRolePermission.findFirst({
      where: { roleId: { in: roleIds }, permissionCode: '*' },
      select: { id: true },
    })
    if (superGrant) return []
    const roles = await this.prisma.adminRole.findMany({ where: { id: { in: roleIds } } })
    return [...new Set(roles.flatMap((r) => r.dataScope))]
  }
}
