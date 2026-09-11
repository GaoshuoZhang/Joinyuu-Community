import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

const CACHE_PREFIX = 'auth:admin:perms:'
/** 权限缓存 TTL（2h，与 JWT 有效期一致） */
const CACHE_TTL = 2 * 60 * 60

/* RBAC 权限装载：按管理员角色聚合权限码集合。
 * '*' 表示超级管理员全量；Redis 缓存，角色/账号变更时主动失效（改角色即时生效）。 */
@Injectable()
export class AdminPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 管理员权限码集合（缓存优先；未命中回源 DB） */
  async getPermCodes(username: string): Promise<string[]> {
    const cached = await this.redis.getCache<string[]>(CACHE_PREFIX + username)
    if (cached) return cached
    const codes = await this.compute(username)
    await this.redis.setCache(CACHE_PREFIX + username, codes, CACHE_TTL)
    return codes
  }

  /** 单个管理员缓存失效（改角色 / 停用 / 重置密码） */
  async invalidate(username: string): Promise<void> {
    await this.redis.delCache(CACHE_PREFIX + username)
  }

  /** 角色权限变更后，失效所有关联该角色的管理员缓存 */
  async invalidateByRole(roleId: string): Promise<void> {
    const links = await this.prisma.adminUserRole.findMany({ where: { roleId } })
    if (links.length === 0) return
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: links.map((l) => l.adminUserId) } },
      select: { username: true },
    })
    await this.redis.delCache(...admins.map((a) => CACHE_PREFIX + a.username))
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
}
