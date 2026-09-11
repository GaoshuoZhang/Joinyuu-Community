import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSION_KEY } from '../decorators/require-permission.decorator'
import { AdminPermissionService } from '../rbac/admin-permission.service'
import type { AuthenticatedRequest } from '../interfaces/authenticated-request'

/* 权限守卫（叠加在 JwtAuthGuard 之后）：
 * 端点声明 @RequirePermission(code | code[]) 时校验当前管理员权限集合；未声明则放行（仅需登录）。
 * 权限集合含 '*'（超管）或命中任一所需码时通过，否则 403。 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: AdminPermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | string[] | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const username = request.user?.sub
    if (!username) throw new UnauthorizedException('未登录或登录已过期')

    const requiredCodes = Array.isArray(required) ? required : [required]
    const codes = await this.permissions.getPermCodes(username)
    if (codes.includes('*') || requiredCodes.some((code) => codes.includes(code))) return true
    throw new ForbiddenException('无权限执行该操作')
  }
}
