/* 状态映射（冻结）：所有页面统一经 StatusTag 组件消费，禁止自造状态文案/配色 */

export interface StatusConf {
  label: string
  theme: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}

export const statusMap = {
  accountDeletion: {
    cooling: { label: '待处理', theme: 'warning' }, approved: { label: '已注销', theme: 'default' },
    rejected: { label: '已驳回', theme: 'danger' }, cancelled: { label: '已撤回', theme: 'default' },
  },
  user: {
    active: { label: '正常', theme: 'success' },
    frozen: { label: '已冻结', theme: 'danger' },
    deleted: { label: '已注销', theme: 'default' },
  },
  verified: {
    verified: { label: '已实名', theme: 'success' },
    unverified: { label: '未实名', theme: 'default' },
  },
  admin: {
    active: { label: '正常', theme: 'success' },
    disabled: { label: '已停用', theme: 'default' },
  },
  loginLog: {
    success: { label: '成功', theme: 'success' },
    failed: { label: '失败', theme: 'danger' },
    locked: { label: '锁定', theme: 'warning' },
  },
  cron: {
    success: { label: '成功', theme: 'success' },
    failed: { label: '失败', theme: 'danger' },
  },
  communityPolicy: {
    published: { label: '已发布', theme: 'success' },
    archived: { label: '已归档', theme: 'default' },
  },
  enterprise: {
    active: { label: '正常', theme: 'success' },
    exited: { label: '已退出', theme: 'default' },
    disabled: { label: '已停用', theme: 'default' },
  },
  application: {
    pending: { label: '待审核', theme: 'warning' },
    approved: { label: '已通过', theme: 'success' },
    rejected: { label: '已驳回', theme: 'danger' },
    withdrawn: { label: '已撤回', theme: 'default' },
  },
  demand: {
    pending: { label: '待审核', theme: 'warning' },
    pending_release: { label: '待发布', theme: 'primary' },
    scheduled: { label: '定时发布中', theme: 'primary' },
    published: { label: '已发布', theme: 'success' },
    selected: { label: '已选定', theme: 'primary' },
    rejected: { label: '已驳回', theme: 'danger' },
    projected: { label: '已立项', theme: 'success' },
    withdrawn: { label: '已撤回', theme: 'default' },
    closed: { label: '已关闭', theme: 'default' },
  },
  project: {
    running: { label: '进行中', theme: 'success' },
    paused: { label: '已暂停', theme: 'warning' },
    closed: { label: '已关闭', theme: 'danger' },
    finished: { label: '已结项', theme: 'default' },
  },
  event: {
    pending_release: { label: '待发布', theme: 'warning' },
    scheduled: { label: '定时发布中', theme: 'primary' },
    published: { label: '已发布', theme: 'success' },
    ended: { label: '已结束', theme: 'default' },
    cancelled: { label: '已取消', theme: 'danger' },
  },
  enrollment: {
    pending: { label: '待审核', theme: 'warning' },
    approved: { label: '已通过', theme: 'success' },
    rejected: { label: '已驳回', theme: 'danger' },
    waitlisted: { label: '候补中', theme: 'primary' },
    cancelled: { label: '已取消', theme: 'default' },
  },
  goods: {
    on: { label: '已上架', theme: 'success' },
    off: { label: '已下架', theme: 'default' },
    restock: { label: '待补货', theme: 'warning' },
  },
  redemption: {
    pending_shipment: { label: '待发货', theme: 'warning' },
    pending_use: { label: '待使用', theme: 'primary' },
    shipped: { label: '已发货', theme: 'primary' },
    finished: { label: '已完成', theme: 'success' },
    cancelled: { label: '已取消', theme: 'default' },
  },
  rule: {
    enabled: { label: '已启用', theme: 'success' },
    disabled: { label: '已停用', theme: 'default' },
  },
  workstation: {
    idle: { label: '空闲', theme: 'success' },
    assigned: { label: '已分配', theme: 'primary' },
    maintenance: { label: '维护中', theme: 'warning' },
  },
  lease: {
    active: { label: '生效中', theme: 'success' },
    expiring: { label: '即将到期', theme: 'warning' },
    expired: { label: '已到期', theme: 'danger' },
    terminated: { label: '已终止', theme: 'default' },
  },
  space: {
    available: { label: '可用', theme: 'success' },
    maintenance: { label: '维护中', theme: 'warning' },
    disabled: { label: '已停用', theme: 'default' },
  },
  reservation: {
    pending: { label: '待审核', theme: 'warning' },
    approved: { label: '待使用', theme: 'success' },
    using: { label: '使用中', theme: 'primary' },
    ended: { label: '已结束', theme: 'default' },
    rejected: { label: '已驳回', theme: 'danger' },
    cancelled: { label: '已取消', theme: 'default' },
  },
  article: {
    pending: { label: '待审核', theme: 'warning' },
    rejected: { label: '已驳回', theme: 'danger' },
    pending_release: { label: '待发布', theme: 'primary' },
    scheduled: { label: '定时发布中', theme: 'primary' },
    published: { label: '已发布', theme: 'success' },
    withdrawn: { label: '已撤回', theme: 'default' },
    closed: { label: '已关闭', theme: 'default' },
  },
  column: {
    enabled: { label: '启用', theme: 'success' },
    disabled: { label: '停用', theme: 'default' },
  },
  announcement: {
    published: { label: '已发布', theme: 'success' },
    withdrawn: { label: '已下架', theme: 'default' },
  },
  /* 消息中心：模板主状态（列表「已发布 vN」的版本号由页面另行拼接，不进词表） */
  messageTemplate: {
    draft: { label: '未发布', theme: 'default' },
    published: { label: '已发布', theme: 'success' },
  },
  /* 消息中心：模板版本状态（发布历史版本即回滚） */
  messageTemplateVersion: {
    draft: { label: '草稿', theme: 'default' },
    pending: { label: '待审核', theme: 'warning' },
    approved: { label: '已通过', theme: 'success' },
    rejected: { label: '已驳回', theme: 'danger' },
    published: { label: '已发布', theme: 'primary' },
    archived: { label: '历史版本', theme: 'default' },
  },
  /* 消息中心：Outbox 投递状态 */
  outbox: {
    pending: { label: '待发送', theme: 'default' },
    sending: { label: '发送中', theme: 'primary' },
    sent: { label: '已送达', theme: 'success' },
    failed: { label: '待重试', theme: 'warning' },
    dead: { label: '死信', theme: 'danger' },
    skipped: { label: '已跳过', theme: 'default' },
  },
  /* 消息中心：渠道凭据就绪状态（配置态而非运行态） */
  messageCredential: {
    configured: { label: '已配置', theme: 'success' },
    missing: { label: '凭据缺失', theme: 'warning' },
    none: { label: '未配置', theme: 'warning' },
  },
} as const

export type StatusEntity = keyof typeof statusMap

/* 申请类型映射（四类：企业入驻 / 个体入驻 / 企业合作 / 企业退驻） */
export const applicationTypeMap: Record<string, { label: string; theme: 'default' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  settle: { label: '企业入驻', theme: 'primary' },
  individual: { label: '个体入驻', theme: 'primary' },
  cooperation: { label: '企业合作', theme: 'primary' },
  exit: { label: '企业退驻', theme: 'warning' },
}

/* 审计日志模块 → 标签主题色（统一维护，键为后端写入的中文模块名，新模块 fallback default） */
export const auditModuleThemeMap: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  社区成员: 'primary',
  社区企业: 'primary',
  合作企业: 'primary',
  审核中心: 'warning',
  需求管理: 'primary',
  项目管理: 'success',
  活动管理: 'success',
  积分商城: 'warning',
  空间管理: 'primary',
  内容管理: 'success',
  素材库: 'success',
  RBAC: 'default',
  系统管理: 'default',
  归档管理: 'default',
  认证: 'default',
}

/* 性别词汇表：兼容历史中文值（男/女）与客户端规范值（male/female/unknown，其中 unknown=保密），
 * 详情展示与编辑表单统一经此处，禁止直接渲染原始值 */
export const userGenderMap: Record<string, string> = {
  male: '男',
  female: '女',
  男: '男',
  女: '女',
  unknown: '保密',
}

/** 原始性别值 → 中文文案；空值与未知码兜底为「保密」/原样返回 */
export function userGenderLabel(value?: string | null): string {
  if (!value) return '保密'
  return userGenderMap[value] ?? value
}

/** 编辑表单规范值：历史中文值在打开表单时归一，保存后统一写入 male/female/unknown */
export function normalizeUserGender(value?: string | null): 'male' | 'female' | 'unknown' {
  if (value === '男' || value === 'male') return 'male'
  if (value === '女' || value === 'female') return 'female'
  return 'unknown'
}

export const userGenderOptions = [
  { label: '保密', value: 'unknown' },
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
]

/* 选项词汇表（页面统一取用，禁止自造文案） */

export const goodsCategoryMap: Record<string, string> = {
  GC001: '实物商品',
  GC003: '权益券',
  physical: '实物商品',
  voucher: '权益券',
}

/* 商品类型字典化后值为中文标签；兼容历史英文值判定实物商品 */
export function isPhysicalCategory(category: string): boolean {
  return category === 'physical' || category === '实物商品'
}

export const workstationTypeMap: Record<string, string> = {
  open: '开放办公位',
  office: '独立办公室',
  semi: '半开放办公位',
}

export const spaceTypeMap: Record<string, string> = {
  meeting: '会议室',
  roadshow: '路演厅',
  meeting_room: '洽谈室',
  multi: '多功能厅',
  study: '自习室',
}

export const spaceStatusOptions = [
  { label: '全部', value: '' },
  { label: '可用', value: 'available' },
  { label: '维护中', value: 'maintenance' },
  { label: '已停用', value: 'disabled' },
]
