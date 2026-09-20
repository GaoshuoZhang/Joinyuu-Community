/* 用户通知类型目录（供通知偏好设置页展示与校验）。
 * mutable=false 的类型不提供静音入口（账号与安全类必须送达），服务端同样拒绝静音。 */
export interface NoticeTypeMeta {
  type: string
  label: string
  mutable: boolean
}

export const NOTICE_TYPE_CATALOG: NoticeTypeMeta[] = [
  { type: 'audit_result', label: '申请与审核结果', mutable: true },
  { type: 'demand', label: '需求动态', mutable: true },
  { type: 'project', label: '项目动态', mutable: true },
  { type: 'event', label: '活动动态', mutable: true },
  { type: 'mall', label: '商城与积分', mutable: true },
  { type: 'invite', label: '企业邀请', mutable: true },
  { type: 'transfer', label: '负责人转移', mutable: true },
  { type: 'content', label: '内容与投稿', mutable: true },
  { type: 'system', label: '系统与账号（不可关闭）', mutable: false },
]

export const MUTABLE_NOTICE_TYPES = NOTICE_TYPE_CATALOG.filter((item) => item.mutable).map((item) => item.type)
