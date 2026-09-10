import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { tap } from 'rxjs'
import { AUDIT_KEY, type AuditMeta } from '../decorators/audit.decorator'
import { AuditService } from '../audit/audit.service'
import type { AuthenticatedRequest } from '../interfaces/authenticated-request'

/* 审计拦截器：@Audit 装饰的写端点在成功后异步留痕（失败不影响主流程） */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()

    if (!meta || request.method === 'GET') {
      return next.handle()
    }

    return next.handle().pipe(
      tap(() => {
        this.audit
          .record({
            module: meta.module,
            action: meta.action,
            target: meta.target ?? '',
            detail: meta.detail,
            operator: request.user?.name,
            ip: request.ip,
          })
          .catch((e: unknown) => {
            console.error('[audit] 写入失败:', e instanceof Error ? e.message : e)
          })
      }),
    )
  }
}
