import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { hash } from 'bcryptjs'
import { randomInt } from 'node:crypto'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { RedisService } from '../../../common/redis/redis.service'
import { passwordExpiredKey } from '../../../common/redis/cache-keys'
import { AuditService } from '../../../common/audit/audit.service'
import { AdminPermissionService } from '../../../common/rbac/admin-permission.service'
import { AdminSessionService } from '../../auth/admin-session.service'
import { formatDateTime, formatNow } from '../../../common/utils/time'
import type { CreateAdminDto } from './dto/create-admin.dto'
import type { UpdateAdminDto } from './dto/update-admin.dto'
import type { ResetPasswordDto } from './dto/reset-password.dto'

/* 初始密码：未显式提供时随机生成 12 位（字母+数字），避免固定默认口令 */
const PASSWORD_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'
const PASSWORD_DIGITS = '23456789'
const PASSWORD_POOL = PASSWORD_LETTERS + PASSWORD_DIGITS

function generateInitialPassword(): string {
  const chars = [PASSWORD_LETTERS[randomInt(PASSWORD_LETTERS.length)], PASSWORD_DIGITS[randomInt(PASSWORD_DIGITS.length)]]
  while (chars.length < 12) chars.push(PASSWORD_POOL[randomInt(PASSWORD_POOL.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export interface AdminAccountDto {
  id: number
  username: string
  name: string
  roleCodes: string[]
  status: 'active' | 'disabled'
  lastLoginAt?: string
  createdAt: string
}

/* 管理员账号：列表/新增/编辑（角色分配）/启停/重置密码 + 审计。
 * 账号变更后失效权限缓存并强制下线，保证角色与登录态即时一致。 */
@Injectable()
export class AdminsService {
  /** 账号编辑仅需角色名称和编码，避免读取角色权限配置的额外授权。 */
  roleOptions(): Promise<{ code: string; name: string }[]> {
    return this.prisma.adminRole.findMany({ select: { code: true, name: true }, orderBy: { sort: 'asc' } })
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly permissions: AdminPermissionService,
    private readonly sessions: AdminSessionService,
  ) {}

  async list(keyword?: string): Promise<{ list: AdminAccountDto[]; total: number }> {
    const kw = keyword?.trim()
    const where = kw
      ? { OR: [{ username: { contains: kw } }, { name: { contains: kw } }] }
      : {}
    const rows = await this.prisma.adminUser.findMany({ where, orderBy: { id: 'asc' } })
    const links = await this.prisma.adminUserRole.findMany()
    const roles = await this.prisma.adminRole.findMany({ select: { id: true, code: true } })
    const roleCodeById = new Map(roles.map((r) => [r.id, r.code]))

    const list = rows.map((a) => {
      const roleCodes = links
        .filter((l) => l.adminUserId === a.id)
        .map((l) => roleCodeById.get(l.roleId) ?? l.roleId)
      return toAdminDto(a, roleCodes)
    })
    return { list, total: list.length }
  }

  async create(
    dto: CreateAdminDto,
    operator: { username: string; name: string },
  ): Promise<{ id: number; initialPassword?: string }> {
    const username = dto.username.trim()
    const exists = await this.prisma.adminUser.findUnique({ where: { username } })
    if (exists) throw new ConflictException('该账号已存在')

    /* 防提权：非超管不得分配超出自身权限的角色（含 super） */
    await this.assertNoEscalation(operator.username, dto.roleCodes)

    const roleIds = await this.resolveRoleIds(dto.roleCodes)
    const initialPassword = dto.password ?? generateInitialPassword()
    const created = await this.prisma.adminUser.create({
      data: {
        username,
        name: dto.name.trim(),
        passwordHash: await hash(initialPassword, 10),
        passwordUpdatedAt: formatNow(),
        status: 'active',
      },
    })
    await this.prisma.adminUserRole.createMany({
      data: roleIds.map((roleId) => ({ adminUserId: created.id, roleId })),
    })
    await this.redis.delCache(passwordExpiredKey(username))
    await this.audit.record({
      module: 'RBAC',
      action: '新增管理员',
      target: `${created.username} · ${created.name}`,
      detail: dto.password ? undefined : '初始密码随机生成',
      operator: operator.name,
    })
    return dto.password ? { id: created.id } : { id: created.id, initialPassword }
  }

  async update(
    id: number,
    dto: UpdateAdminDto,
    operator: { username: string; name: string },
  ): Promise<{ code: number }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id } })
    if (!admin) throw new NotFoundException('管理员不存在')
    /* 防提权：非超管不得操作超管账号，也不得分配超出自身权限的角色 */
    await this.assertOperatorCanManageTarget(operator.username, id)
    await this.assertNoEscalation(operator.username, dto.roleCodes)
    const roleIds = await this.resolveRoleIds(dto.roleCodes)

    /* 最后一名启用超管不可降权（避免系统失去全量权限入口） */
    if (admin.status === 'active' && !dto.roleCodes.includes('super')) {
      const wasSuper = await this.hasRole(id, 'super')
      if (wasSuper && !(await this.hasOtherActiveSuper(id))) {
        throw new BadRequestException('系统需保留至少一名启用状态的超级管理员')
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { id }, data: { name: dto.name.trim() } })
      await tx.adminUserRole.deleteMany({ where: { adminUserId: id } })
      await tx.adminUserRole.createMany({
        data: roleIds.map((roleId) => ({ adminUserId: id, roleId })),
      })
    })
    await this.permissions.invalidate(admin.username)
    await this.audit.record({
      module: 'RBAC',
      action: '编辑管理员',
      target: `${admin.username} · ${admin.name}`,
      detail: `角色：${dto.roleCodes.join('、')}`,
      operator: operator.name,
    })
    return { code: 0 }
  }

  async updateStatus(
    id: number,
    status: 'active' | 'disabled',
    operator: { username: string; name: string },
  ): Promise<{ code: number }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id } })
    if (!admin) throw new NotFoundException('管理员不存在')
    if (admin.username === operator.username && status === 'disabled') {
      throw new BadRequestException('不可停用当前登录账号')
    }
    if (admin.status === status) return { code: 0 }

    /* 防提权：非超管不得停用/启用超管账号 */
    await this.assertOperatorCanManageTarget(operator.username, id)

    /* 最后一名启用超管不可停用 */
    if (status === 'disabled' && (await this.hasRole(id, 'super')) && !(await this.hasOtherActiveSuper(id))) {
      throw new BadRequestException('系统需保留至少一名启用状态的超级管理员')
    }

    await this.prisma.adminUser.update({ where: { id }, data: { status } })
    await this.permissions.invalidate(admin.username)
    if (status === 'disabled') await this.sessions.kickByUsername(admin.username)
    await this.audit.record({
      module: 'RBAC',
      action: status === 'disabled' ? '停用管理员' : '启用管理员',
      target: `${admin.username} · ${admin.name}`,
      operator: operator.name,
    })
    return { code: 0 }
  }

  async resetPassword(
    id: number,
    dto: ResetPasswordDto,
    operator: { username: string; name: string },
  ): Promise<{ code: number }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id } })
    if (!admin) throw new NotFoundException('管理员不存在')
    /* 防提权：非超管不得重置超管密码（否则可直接接管系统） */
    await this.assertOperatorCanManageTarget(operator.username, id)
    await this.prisma.adminUser.update({
      where: { id },
      data: { passwordHash: await hash(dto.password, 10), passwordUpdatedAt: formatNow() },
    })
    await this.redis.delCache(passwordExpiredKey(admin.username))
    /* 旧 token 全部失效（黑名单） */
    await this.sessions.kickByUsername(admin.username)
    await this.audit.record({
      module: 'RBAC',
      action: '重置管理员密码',
      target: `${admin.username} · ${admin.name}`,
      operator: operator.name,
    })
    return { code: 0 }
  }

  /** 防提权：非超管不得为账号分配超出自身权限的角色（含 '*'） */
  private async assertNoEscalation(operatorUsername: string, roleCodes: string[]): Promise<void> {
    const operatorCodes = await this.permissions.getPermCodes(operatorUsername)
    if (operatorCodes.includes('*')) return
    const codes = [...new Set(roleCodes)]
    const roles = await this.prisma.adminRole.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    })
    if (roles.length === 0) return
    const rows = await this.prisma.adminRolePermission.findMany({
      where: { roleId: { in: roles.map((r) => r.id) } },
      select: { permissionCode: true },
    })
    const granted = [...new Set(rows.map((r) => r.permissionCode))]
    const escalated = granted.filter((code) => code === '*' || !operatorCodes.includes(code))
    if (escalated.length > 0) {
      throw new ForbiddenException('不可分配超出自身权限范围的角色或超级管理员')
    }
  }

  /** 防提权：非超管不得对超管账号执行改角色/改状态/重置密码 */
  private async assertOperatorCanManageTarget(operatorUsername: string, targetAdminUserId: number): Promise<void> {
    const operatorCodes = await this.permissions.getPermCodes(operatorUsername)
    if (operatorCodes.includes('*')) return
    if (await this.hasRole(targetAdminUserId, 'super')) {
      throw new ForbiddenException('不可操作超级管理员账号')
    }
  }

  /** 账号是否持有指定角色码 */
  private async hasRole(adminUserId: number, roleCode: string): Promise<boolean> {
    const role = await this.prisma.adminRole.findUnique({ where: { code: roleCode } })
    if (!role) return false
    const link = await this.prisma.adminUserRole.count({ where: { adminUserId, roleId: role.id } })
    return link > 0
  }

  /** 除 excludeId 外是否仍有启用状态的超管 */
  private async hasOtherActiveSuper(excludeId: number): Promise<boolean> {
    const role = await this.prisma.adminRole.findUnique({ where: { code: 'super' } })
    if (!role) return false
    const links = await this.prisma.adminUserRole.findMany({ where: { roleId: role.id } })
    const otherIds = links.map((l) => l.adminUserId).filter((id) => id !== excludeId)
    if (otherIds.length === 0) return false
    const count = await this.prisma.adminUser.count({
      where: { id: { in: otherIds }, status: 'active' },
    })
    return count > 0
  }

  private async resolveRoleIds(roleCodes: string[]): Promise<string[]> {
    const codes = [...new Set(roleCodes)]
    const roles = await this.prisma.adminRole.findMany({ where: { code: { in: codes } } })
    if (roles.length !== codes.length) {
      const known = new Set(roles.map((r) => r.code))
      const invalid = codes.filter((c) => !known.has(c))
      throw new BadRequestException(`存在无效角色：${invalid.join('、')}`)
    }
    return roles.map((r) => r.id)
  }
}

function toAdminDto(
  a: { id: number; username: string; name: string; status: string; lastLoginAt: string | null; createdAt: Date },
  roleCodes: string[],
): AdminAccountDto {
  const dto: AdminAccountDto = {
    id: a.id,
    username: a.username,
    name: a.name,
    roleCodes,
    status: a.status === 'active' ? 'active' : 'disabled',
    createdAt: formatDateTime(a.createdAt),
  }
  if (a.lastLoginAt != null) dto.lastLoginAt = a.lastLoginAt
  return dto
}
