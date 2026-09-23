import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { AuditService } from '../../../common/audit/audit.service'
import { AdminPermissionService } from '../../../common/rbac/admin-permission.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { formatNow } from '../../../common/utils/time'

export interface AdminRoleDto {
  id: string
  code: string
  name: string
  description: string
  permCodes: string[]
  /** 数据范围域集合（空数组 = 不限制全部） */
  dataScope: string[]
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
    private readonly ids: IdGeneratorService,
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
      dataScope: r.dataScope,
    }))
  }

  /** 新增自定义角色：初始无权限点（经「权限配置」分配）；编码唯一且不可占用内置 super */
  async create(
    dto: { code: string; name: string; description?: string },
    operator: { username: string; name: string },
  ): Promise<AdminRoleDto> {
    const code = dto.code.trim()
    const name = dto.name.trim()
    const description = dto.description?.trim() ?? ''
    if (code === 'super') throw new BadRequestException('不可使用内置角色编码 super')

    const codeExists = await this.prisma.adminRole.findUnique({ where: { code } })
    if (codeExists) throw new ConflictException('该角色编码已存在')
    const nameExists = await this.prisma.adminRole.findFirst({ where: { name } })
    if (nameExists) throw new ConflictException('该角色名称已存在')

    const maxSort = await this.prisma.adminRole.aggregate({ _max: { sort: true } })
    const created = await this.prisma.adminRole.create({
      data: {
        id: await this.ids.next('R'),
        code,
        name,
        description: description || '自定义角色',
        sort: (maxSort._max.sort ?? 0) + 10,
        createdAt: formatNow(),
      },
    })
    await this.audit.record({
      module: 'RBAC',
      action: '新增角色',
      target: `${created.code} · ${created.name}`,
      detail: '初始无权限点，待权限配置分配',
      operator: operator.name,
    })
    return {
      id: created.id,
      code: created.code,
      name: created.name,
      description: created.description,
      permCodes: [],
      dataScope: created.dataScope,
    }
  }

  async savePermissions(
    id: string,
    permCodes: string[],
    operator: { username: string; name: string },
  ): Promise<{ code: number }> {
    const role = await this.prisma.adminRole.findUnique({ where: { id } })
    if (!role) throw new NotFoundException('角色不存在')

    const unique = await this.validatePermCodes(role, permCodes, operator)

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

  /** 设置角色数据范围（域集合）；空数组 = 不限制全部；超管角色不可限制 */
  async saveScope(
    id: string,
    dataScope: string[],
    operator: { username: string; name: string },
  ): Promise<{ code: number }> {
    const role = await this.prisma.adminRole.findUnique({ where: { id } })
    if (!role) throw new NotFoundException('角色不存在')
    if (role.code === 'super') throw new BadRequestException('超级管理员角色不可限制数据范围')

    const unique = [...new Set(dataScope)]
    await this.prisma.adminRole.update({ where: { id }, data: { dataScope: unique } })
    /* 数据范围变更 → 关联管理员权限/范围缓存失效（改角色即时生效） */
    await this.permissions.invalidateByRole(id)
    await this.audit.record({
      module: 'RBAC',
      action: '设置数据范围',
      target: `${role.code} · ${role.name}`,
      detail: unique.length === 0 ? '不限制（全部域）' : `数据范围：${unique.join('、')}`,
      operator: operator.name,
    })
    return { code: 0 }
  }

  /**
   * 合并保存角色权限 + 数据范围：单事务落库（权限集合替换 + dataScope 更新），
   * 取代前端「先 scope 后 permissions」两次串行请求——部分失败会留下
   * 「新范围 + 旧权限」的 RBAC 中间态。校验口径与两个单接口保持一致。
   */
  async saveAssignment(
    id: string,
    permCodes: string[],
    dataScope: string[],
    operator: { username: string; name: string },
  ): Promise<{ code: number }> {
    const role = await this.prisma.adminRole.findUnique({ where: { id } })
    if (!role) throw new NotFoundException('角色不存在')
    /* saveScope 的超管限制在合并接口同样适用 */
    if (role.code === 'super' && dataScope.length > 0) {
      throw new BadRequestException('超级管理员角色不可限制数据范围')
    }

    const unique = await this.validatePermCodes(role, permCodes, operator)
    const scope = [...new Set(dataScope)]

    await this.prisma.$transaction(async (tx) => {
      await tx.adminRolePermission.deleteMany({ where: { roleId: id } })
      if (unique.length > 0) {
        await tx.adminRolePermission.createMany({
          data: unique.map((code) => ({ roleId: id, permissionCode: code })),
        })
      }
      await tx.adminRole.update({ where: { id }, data: { dataScope: scope } })
    })
    await this.permissions.invalidateByRole(id)
    await this.audit.record({
      module: 'RBAC',
      action: '保存角色权限配置',
      target: `${role.code} · ${role.name}`,
      detail: `${unique.includes('*') ? '全量权限' : `${unique.length} 个权限点`}；${scope.length === 0 ? '范围不限制（全部域）' : `数据范围：${scope.join('、')}`}`,
      operator: operator.name,
    })
    return { code: 0 }
  }

  /** 权限码集合校验（单接口与合并接口共用）：格式、有效性、提权防护；返回去重后的集合 */
  private async validatePermCodes(
    role: { code: string },
    permCodes: string[],
    operator: { username: string; name: string },
  ): Promise<string[]> {
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
    return unique
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
