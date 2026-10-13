import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { RedisService } from '../redis/redis.service'
import type { AppJwtPayload } from '../interfaces/app-jwt-payload'
import type { AppAuthenticatedRequest } from '../interfaces/app-authenticated-request'
import { PrismaService } from '../prisma/prisma.service'

/* /api/app/** 全局 JWT Guard（@Public 豁免）：
 * 与 admin JwtAuthGuard 平行——按路径前缀分流：仅校验 /api/app/**，其余路径放行给 admin guard。
 * 校验签名 + Redis 黑名单（登出令牌失效）；黑名单查询失败默认 fail-closed（RedisService 抛 503，
 * 避免已吊销令牌继续可用），仅 AUTH_REVOCATION_FAIL_OPEN=1 时降级放行。
 * 端点代码通过 @Public() 豁免（登录/注册/验证码/找回密码等）。 */
@Injectable()
export class AppJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppAuthenticatedRequest>()
    const path = (request.path || request.url || '').split('?')[0]

    /* 非 app 路径由 admin 体系（JwtAuthGuard/PermissionGuard/DomainScopeGuard）负责 */
    if (path !== '/api/app' && !path.startsWith('/api/app/')) return true

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthorizedException('未登录或登录已过期')

    try {
      const payload = await this.jwt.verifyAsync<AppJwtPayload>(token)
      if (payload.scope !== 'app') throw new UnauthorizedException('令牌无效')
      const blacklisted = await this.redis.isBlacklisted(payload.jti)
      if (blacklisted) throw new UnauthorizedException('登录已过期，请重新登录')
      const user = await this.prisma.user.findUnique({ where: { uid: payload.sub }, select: { status: true } })
      if (!user) throw new UnauthorizedException('登录已过期，请重新登录')
      if (user.status === 'frozen') throw new ForbiddenException('账号已冻结，请联系社区运营')
      if (user.status !== 'active') throw new UnauthorizedException('账号已注销或停用')
      request.user = payload
      return true
    } catch (error) {
      /* 认证/授权类原样抛出；吊销策略服务故障（503）也原样抛出，
       * 避免被重写成 401「登录已过期」导致客户端在 Redis 抖动时全局掉线。 */
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error
      }
      throw new UnauthorizedException('登录已过期，请重新登录')
    }
  }
}
