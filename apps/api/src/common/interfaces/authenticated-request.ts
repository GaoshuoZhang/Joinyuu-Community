import type { Request } from 'express'
import type { AdminJwtPayload } from './admin-jwt-payload'

/** 携带 JWT 载荷的请求（JwtAuthGuard 注入 request.user） */
export interface AuthenticatedRequest extends Request {
  user?: AdminJwtPayload
}
