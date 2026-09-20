import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { tap } from 'rxjs/operators'
import { PrismaService } from '../prisma/prisma.service'

/** 只记录成功操作的名称与用户 ID，不采集表单、身份信息、密码等请求体；失败不影响业务。 */
@Injectable()
export class AppAnalyticsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AppAnalyticsInterceptor.name)
  constructor(private readonly prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest()
    const path = (req.path ?? '').replace(/^\/api\/app/, '')
    const routes: [RegExp, string][] = [
      [/^\/auth\/login$/, 'login'], [/^\/auth\/register$/, 'register'], [/^\/demands$/, 'demand_publish'],
      [/^\/demands\/[^/]+\/respond$/, 'demand_respond'], [/^\/events\/[^/]+\/enroll$/, 'event_enroll'],
      [/^\/events\/[^/]+\/check-in$/, 'checkin'], [/^\/mall\/orders$/, 'mall_order'],
      [/^\/articles$/, 'article_submit'], [/^\/spaces\/reservations$/, 'space_reserve'],
      [/^\/me\/favorites\/toggle$/, 'favorite'],
    ]
    const eventType = req.path?.startsWith('/api/app/') && req.method === 'POST' ? routes.find(([pattern]) => pattern.test(path))?.[1] : undefined
    if (!eventType) return next.handle()
    return next.handle().pipe(tap((result) => {
      const uid = req.user?.sub ?? result?.uid ?? result?.data?.uid
      void this.prisma.analyticsEvent.create({ data: { eventType, userId: uid ?? null } }).catch(() => this.logger.warn('埋点写入失败'))
    }))
  }
}
