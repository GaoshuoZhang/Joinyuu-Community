import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { AdminPermissionService } from '../rbac/admin-permission.service'
import type { AuthenticatedRequest } from '../interfaces/authenticated-request'

/* 管理端路径首段 → 数据范围域映射（/api/admin/<segment> 前缀匹配） */
const DOMAIN_BY_SEGMENT: Record<string, string> = {
  users: 'members',
  'member-governance': 'members',
  cards: 'members',
  individuals: 'members',
  enterprises: 'members',
  'external-enterprises': 'members',
  applications: 'members',
  demands: 'biz',
  projects: 'biz',
  events: 'biz',
  workstations: 'space',
  'workstation-leases': 'space',
  'workstation-areas': 'space',
  leases: 'space',
  spaces: 'space',
  'space-reservations': 'space',
  contents: 'contents',
  announcements: 'contents',
  mall: 'mall',
  rules: 'rules',
  'experience-records': 'rules',
  'points-records': 'rules',
  ledgers: 'rules',
  system: 'system',
  logs: 'system',
  'audit-logs': 'system',
  'login-logs': 'system',
  admins: 'system',
  roles: 'system',
  permissions: 'system',
  trash: 'system',
  export: 'system',
  assets: 'system',
  monitor: 'system',
  dicts: 'system',
  config: 'system',
}

/* 数据范围守卫（叠加在 JwtAuthGuard、PermissionGuard 之后）：
 * 端点按路径首段归属数据域，管理员数据范围非空且不含该域时 403；
 * 空范围 = 不限制全部域；超管（权限含 '*'）放行；未映射路径（auth/dashboard/notifications 等）放行。 */
@Injectable()
export class DomainScopeGuard implements CanActivate {
  constructor(private readonly permissions: AdminPermissionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const username = request.user?.sub
    /* 未登录由 JwtAuthGuard 负责（@Public 选项端点等） */
    if (!username) return true

    const path = (request.path || request.url || '').split('?')[0]
    const segment = /^\/api\/admin\/([^/]+)/.exec(path)?.[1]
    if (!segment) return true
    const domain = DOMAIN_BY_SEGMENT[segment]
    if (!domain) return true

    const codes = await this.permissions.getPermCodes(username)
    if (codes.includes('*')) return true

    const scopes = await this.permissions.getScopeCodes(username)
    if (scopes.length === 0) return true
    if (scopes.includes(domain)) return true
    throw new ForbiddenException('无权限访问该数据范围')
  }
}
