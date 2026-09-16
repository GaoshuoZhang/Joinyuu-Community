import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { passwordExpiredKey } from '../redis/cache-keys'
import { RedisService } from '../redis/redis.service'
import type { AdminJwtPayload } from '../interfaces/admin-jwt-payload'
import type { AuthenticatedRequest } from '../interfaces/authenticated-request'

/** 密码过期状态下仍可访问的路径（路径包含匹配）：改密 / 登出 / 验证码 / 登录 / 健康检查 */
const PWD_EXPIRED_WHITELIST = [
  '/auth/change-password',
  '/auth/logout',
  '/auth/captcha',
  '/auth/login',
  '/health',
]

/* /api/admin/** 全局 JWT Guard（@Public 豁免）：
 * 校验签名 + Redis 黑名单（登出令牌失效）+ 密码过期标记（仅放行白名单路径）；
 * 黑名单/过期标记查询失败时 fail-open 放行（降级可用性优先） */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    /* /api/app/** 由 AppJwtGuard 负责（路径分流，避免 admin 载荷误判 app 令牌） */
    const path = (request.path || request.url || '').split('?')[0]
    if (path === '/api/app' || path.startsWith('/api/app/')) return true

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthorizedException('未登录或登录已过期')

    try {
      const payload = await this.jwt.verifyAsync<AdminJwtPayload & { scope?: string }>(token)
      /* app 域令牌（scope='app'）禁止访问 admin 端点（路径分流见 R1-1） */
      if (payload.scope === 'app') throw new UnauthorizedException('登录已过期，请重新登录')
      const blacklisted = await this.redis.isBlacklisted(payload.jti)
      if (blacklisted) throw new UnauthorizedException('登录已过期，请重新登录')

      const whitelisted = PWD_EXPIRED_WHITELIST.some((path) => request.path.includes(path))
      if (payload.sub && !whitelisted && (await this.redis.hasFlag(passwordExpiredKey(payload.sub)))) {
        throw new ForbiddenException('密码已过期，请先修改密码')
      }

      request.user = payload
      return true
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error
      throw new UnauthorizedException('登录已过期，请重新登录')
    }
  }
}
