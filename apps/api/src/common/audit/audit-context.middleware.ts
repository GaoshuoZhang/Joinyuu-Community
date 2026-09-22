import { Injectable } from '@nestjs/common'
import type { NestMiddleware } from '@nestjs/common'
import type { NextFunction, Response } from 'express'
import { clientIpOf, runWithAuditContext } from './audit-context'
import type { AuthenticatedRequest } from '../interfaces/authenticated-request'

/* 全局中间件：把请求 IP 放入 AsyncLocalStorage，供 AuditService.record 缺省使用。
 * 放在 AppModule.configure 注册，不改变各域 40+ 处 audit.record({...}) 的调用签名。 */
@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  use(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    runWithAuditContext({ ip: clientIpOf(req), request: req }, () => next())
  }
}