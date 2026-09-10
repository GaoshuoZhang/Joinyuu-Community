import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { RedisService } from '../redis/redis.service'
import type { AdminJwtPayload } from '../interfaces/admin-jwt-payload'
import type { AuthenticatedRequest } from '../interfaces/authenticated-request'

/* /api/admin/** 全局 JWT Guard（@Public 豁免）：
 * 校验签名 + Redis 黑名单（登出令牌失效）；黑名单查询失败时 fail-open 放行（降级可用性优先） */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthorizedException('未登录或登录已过期')

    try {
      const payload = await this.jwt.verifyAsync<AdminJwtPayload>(token)
      const blacklisted = await this.redis.isBlacklisted(payload.jti)
      if (blacklisted) throw new UnauthorizedException('登录已过期，请重新登录')
      request.user = payload
      return true
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error
      throw new UnauthorizedException('登录已过期，请重新登录')
    }
  }
}
