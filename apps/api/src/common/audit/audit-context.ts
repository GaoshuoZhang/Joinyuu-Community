import { AsyncLocalStorage } from 'node:async_hooks'
import type { AuthenticatedRequest } from '../interfaces/authenticated-request'

/* 请求级审计上下文：由 AuditContextMiddleware 在请求进入时写入，AuditService.record 读取缺省值
 * （显式传入优先）。定时任务等无请求场景没有上下文，保持 ip 为空、operator 回落「系统」。 */
export interface AuditContext {
  /** 客户端来源 IP（trust proxy 下为真实客户端地址） */
  ip?: string
  /** 当前请求引用：request.user 由 JwtAuthGuard 在中间件之后注入，故此处只存引用，record 时再读 */
  request?: AuthenticatedRequest
}

const storage = new AsyncLocalStorage<AuditContext>()

/** 在给定上下文中执行后续链路（中间件内同步调用 next，JS 异步资源沿用该上下文） */
export function runWithAuditContext<T>(context: AuditContext, fn: () => T): T {
  return storage.run(context, fn)
}

/** 当前请求的审计上下文；无请求（定时任务/启动期）时返回 undefined */
export function currentAuditContext(): AuditContext | undefined {
  return storage.getStore()
}

/** 统一客户端 IP 取法（与 auth/login-log 域口径一致：req.ip 优先，回落 socket 远端地址）。
 * AuditLog.ip 为 VarChar(64)，异常超长（畸形代理头）时截断，避免写审计失败。 */
export function clientIpOf(req: AuthenticatedRequest): string | undefined {
  const ip = (req.ip ?? req.socket?.remoteAddress ?? '').trim()
  return ip ? ip.slice(0, 64) : undefined
}