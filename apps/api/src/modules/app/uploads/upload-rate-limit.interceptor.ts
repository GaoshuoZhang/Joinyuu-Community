import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import type { Observable } from 'rxjs'
import { RedisService } from '../../../common/redis/redis.service'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'

/** 单用户上传上限（每分钟） */
const USER_MAX_PER_MINUTE = 20
/** 单 IP 上传上限（每分钟） */
const IP_MAX_PER_MINUTE = 60
const WINDOW_SEC = 60

/* App 上传频控：必须排在 FileInterceptor 之前（外层拦截器），在 multer 内存缓冲前拒绝超频请求。
 * 维度：用户（uid）与 IP，超限 429；Redis 不可用时 incrWithTtl 返回 null（降级放行，不阻断上传）。 */
@Injectable()
export class AppUploadRateLimitInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<AppAuthenticatedRequest>()

    const uid = req.user?.sub?.trim()
    if (uid) {
      const count = await this.redis.incrWithTtl(`upload:rate:user:${uid}`, WINDOW_SEC)
      if (count !== null && count > USER_MAX_PER_MINUTE) {
        throw new HttpException('上传过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
      }
    }

    const ip = (req.ip ?? req.socket.remoteAddress ?? '').trim()
    if (ip) {
      const count = await this.redis.incrWithTtl(`upload:rate:ip:${ip}`, WINDOW_SEC)
      if (count !== null && count > IP_MAX_PER_MINUTE) {
        throw new HttpException('上传过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
      }
    }

    return next.handle()
  }
}