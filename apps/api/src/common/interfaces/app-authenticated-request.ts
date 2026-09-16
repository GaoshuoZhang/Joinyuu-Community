import type { Request } from 'express'
import type { AppJwtPayload } from './app-jwt-payload'

/** 携带 App 端 JWT 载荷的请求（AppJwtGuard 注入 request.user） */
export interface AppAuthenticatedRequest extends Request {
  user?: AppJwtPayload
}