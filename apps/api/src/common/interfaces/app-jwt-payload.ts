/** App 端（/api/app/**）JWT 载荷：登录注册后签发，scope='app' 与 admin 令牌隔离 */
export interface AppJwtPayload {
  /** 用户 UID（User.uid） */
  sub: string
  /** 昵称（展示用，头像等详情以接口拉取为准） */
  name: string
  /** 令牌域：固定 'app'（AppJwtGuard 校验） */
  scope: 'app'
  /** 身份摘要（登录时快照）：{ type, label }[]，后续接口可刷新，不以此为准 */
  identities: Array<{
    type: string
    label: string
    level?: number
    experience?: number
    enterpriseId?: string
    enterpriseName?: string
    enterpriseRole?: string
  }>
  /** 令牌唯一标识（登出黑名单键） */
  jti: string
  iat?: number
  exp?: number
}
