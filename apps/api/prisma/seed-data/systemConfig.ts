import type { SystemConfig } from '@/types'

/* 系统配置（单例） — 运行时开关类配置，区别于"积分规则"等业务规则数据
 * M0：mock 单例 + 保存即生效（会话内）；M1：持久化到数据库并支持按端下发 */
export const systemConfig: SystemConfig = {
  siteName: '聚屿社区',
  siteSlogan: '让每一座创业孤岛，在这里连成群岛。',
  registrationOpen: true,
  /** 手机号/邮箱注册渠道开关（仅 registrationOpen=true 时生效）：关闭后不允许该渠道注册新账号 */
  phoneRegisterOpen: true,
  emailRegisterOpen: true,
  mallOpen: true,
  demandOpen: true,
  reservationOpen: true,
  realnameRequired: false,
  homeCarouselOpen: true,
  leaseExpireRemindDays: 15,
  uploadMaxSizeMb: 10,
  /** 密码过期强制改密：默认关闭（密码永不过期）；开启后按 passwordExpireDays 计算后台账号密码有效期 */
  passwordExpireEnabled: false,
  passwordExpireDays: 90,
  minioEnabled: false,
  minioEndpoint: '',
  minioPort: 9000,
  minioUseSsl: false,
  minioAccessKey: '',
  minioSecretKey: '',
  minioBucket: 'joinyuu',
  updatedAt: '2026-09-01 09:00',
  updatedBy: '系统初始化',
}
