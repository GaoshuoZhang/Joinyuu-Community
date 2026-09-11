import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { AuditService } from '../../../common/audit/audit.service'
import { AdminPermissionService } from '../../../common/rbac/admin-permission.service'

export interface AdminRoleDto {
  id: string
  code: string
  name: string
  description: string
  permCodes: string[]
}

export interface PermissionItemDto {
  code: string
  name: string
  authType: string
}

export interface PermissionGroupDto {
  name: string
  perms: PermissionItemDto[]
}

/* 角色与权限：角色列表（含权限码集合）/ 权限分配 / 权限点目录。
 * 权限码 = 菜单路径 或 perm:xxx 按钮码；'*' 为超级管理员全量。 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: AdminPermissionService,
  ) {}

  async list(): Promise<AdminRoleDto[]> {
    const [roles, rolePerms] = await Promise.all([
      this.prisma.adminRole.findMany({ orderBy: { sort: 'asc' } }),
      this.prisma.adminRolePermission.findMany(),
    ])
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      permCodes: rolePerms.filter((p) => p.roleId === r.id).map((p) => p.permissionCode),
    }))
  }

  async savePermissions(
    id: string,
    permCodes: string[],
    operator: { username: string; name: string },
  ): Promise<{ code: number }> {
    const role = await this.prisma.adminRole.findUnique({ where: { id } })
    if (!role) throw new NotFoundException('角色不存在')

    const unique = [...new Set(permCodes)]
    if (unique.includes('*') && unique.length > 1) {
      throw new BadRequestException('全量权限（*）不可与其他权限码同时保存')
    }
    if (!unique.includes('*')) {
      const known = await this.prisma.adminPermission.findMany({ select: { code: true } })
      const knownSet = new Set(known.map((p) => p.code))
      const invalid = unique.filter((c) => !knownSet.has(c))
      if (invalid.length > 0) throw new BadRequestException(`存在无效权限码：${invalid.join('、')}`)
    }

    /* 提权防护：超管角色仅超管可改且必须保留 '*'；非超管不可授予 '*' 或自身权限之外的权限码 */
    const operatorCodes = await this.permissions.getPermCodes(operator.username)
    const operatorIsSuper = operatorCodes.includes('*')
    if (role.code === 'super') {
      if (!operatorIsSuper) throw new ForbiddenException('仅超级管理员可修改超级管理员角色')
      if (unique.length !== 1 || unique[0] !== '*') {
        throw new BadRequestException('超级管理员角色必须保留全量权限（*）')
      }
    } else if (!operatorIsSuper) {
      if (unique.includes('*')) throw new ForbiddenException('仅超级管理员可分配全量权限')
      const exceeded = unique.filter((c) => !operatorCodes.includes(c))
      if (exceeded.length > 0) {
        throw new ForbiddenException(`不可分配超出自身权限范围的权限码：${exceeded.join('、')}`)
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.adminRolePermission.deleteMany({ where: { roleId: id } })
      if (unique.length > 0) {
        await tx.adminRolePermission.createMany({
          data: unique.map((code) => ({ roleId: id, permissionCode: code })),
        })
      }
    })
    /* 角色权限变更 → 关联管理员权限缓存失效（改角色即时生效） */
    await this.permissions.invalidateByRole(id)
    await this.audit.record({
      module: 'RBAC',
      action: '分配角色权限',
      target: `${role.code} · ${role.name}`,
      detail: unique.includes('*') ? '全量权限' : `${unique.length} 个权限点`,
      operator: operator.name,
    })
    return { code: 0 }
  }

  /** 权限点目录（按模块分组，供角色权限矩阵渲染） */
  async catalog(): Promise<PermissionGroupDto[]> {
    const rows = await this.prisma.adminPermission.findMany({ orderBy: [{ sort: 'asc' }] })
    const groups: PermissionGroupDto[] = []
    for (const p of rows) {
      let g = groups.find((x) => x.name === p.module)
      if (!g) {
        g = { name: p.module, perms: [] }
        groups.push(g)
      }
      g.perms.push({ code: p.code, name: p.name, authType: p.authType })
    }
    return groups
  }
}
