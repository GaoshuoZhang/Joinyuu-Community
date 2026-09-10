export interface AdminJwtPayload {
  /** 用户名（AdminUser.username） */
  sub: string
  /** 展示名（如"社区管理员"） */
  name: string
  /** 令牌唯一标识（登出黑名单键） */
  jti: string
  iat?: number
  exp?: number
}
