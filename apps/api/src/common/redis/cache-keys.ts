/* 缓存键与 TTL（wiki-backend.md §10）。
 * seed 重种子后需整体失效，避免测试/开发环境读到旧数据；auth:blacklist 不在此列。 */
export const CACHE_TTL = {
  /** 配置 / 字典 / 规则：读多写少，写操作主动失效 */
  stable: 600,
  /** 工作台聚合：待办实时性优先，短 TTL 自然过期 */
  dashboard: 60,
} as const

export const CACHE_KEYS = {
  systemConfig: 'config:system',
  pointsRules: 'rules:points',
  experienceRules: 'rules:experience',
  levelTiers: 'rules:levels',
  dashboardSummary: 'dashboard:summary',
} as const

/** 字典键：dicts:{type} */
export function dictCacheKey(type: string): string {
  return `dicts:${type}`
}

/** 密码过期标记键（登录超期时写入，JWT 守卫读取；改密/重置后清除） */
export function passwordExpiredKey(username: string): string {
  return `auth:admin:pwd-expired:${username}`
}

/** 验证码接口 IP 限流键（60s 窗口） */
export function captchaRateKey(ip: string): string {
  return `auth:captcha:rate:${ip}`
}

/** 全部应用缓存键（seed 重种子后清理；不含 JWT 黑名单） */
export const APP_CACHE_KEYS: readonly string[] = [
  CACHE_KEYS.systemConfig,
  CACHE_KEYS.pointsRules,
  CACHE_KEYS.experienceRules,
  CACHE_KEYS.levelTiers,
  CACHE_KEYS.dashboardSummary,
  dictCacheKey('demand_category'),
  dictCacheKey('industry'),
  dictCacheKey('event_type'),
]
