import type { JwtService } from '@nestjs/jwt'
import type { PrismaService } from '../prisma/prisma.service'
import type { RedisService } from '../redis/redis.service'

/* @Public 端点上的「可选登录态」解析：验签 + scope=app + 登出黑名单 + 账号状态。
 * 与 AppJwtGuard 同口径，避免已登出/已冻结/已注销账号在公开端点仍被认作登录用户
 * （公开详情页的 liked、联系人可见性、未读数等依赖该判定）。
 * 任一校验不通过（含 Redis 吊销服务不可用）一律按未登录处理：公开端点保持可用，且不放大权限。 */
export interface OptionalAppAuthDeps {
  jwt: JwtService
  redis: RedisService
  prisma: PrismaService
}

export async function resolveOptionalAppUid(
  deps: OptionalAppAuthDeps,
  authorization?: string,
): Promise<string | undefined> {
  if (!authorization?.startsWith('Bearer ')) return undefined
  try {
    const payload = await deps.jwt.verifyAsync<{ sub: string; scope?: string; jti?: string }>(
      authorization.slice(7),
    )
    if (payload.scope !== 'app' || !payload.sub) return undefined
    if (payload.jti && (await deps.redis.isBlacklisted(payload.jti))) return undefined
    const user = await deps.prisma.user.findUnique({
      where: { uid: payload.sub },
      select: { status: true },
    })
    return user?.status === 'active' ? payload.sub : undefined
  } catch {
    return undefined
  }
}