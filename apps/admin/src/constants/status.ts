/* 状态映射（冻结）：所有页面统一经 StatusTag 组件消费，禁止自造状态文案/配色 */

export interface StatusConf {
  label: string
  theme: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}

export const statusMap = {
  user: {
    active: { label: '正常', theme: 'success' },
    frozen: { label: '已冻结', theme: 'danger' },
  },
  enterprise: {
    active: { label: '正常', theme: 'success' },
    exited: { label: '已退出', theme: 'default' },
    disabled: { label: '已停用', theme: 'default' },
  },
  showcase: {
    published: { label: '已发布', theme: 'success' },
    pending: { label: '待审核', theme: 'warning' },
    rejected: { label: '已驳回', theme: 'danger' },
    none: { label: '未提交', theme: 'default' },
  },
  application: {
    pending: { label: '待审核', theme: 'warning' },
    approved: { label: '已通过', theme: 'success' },
    rejected: { label: '已驳回', theme: 'danger' },
  },
  demand: {
    pending: { label: '待审核', theme: 'warning' },
    pending_release: { label: '待发布', theme: 'primary' },
    scheduled: { label: '定时发布中', theme: 'primary' },
    published: { label: '已发布', theme: 'success' },
    rejected: { label: '已驳回', theme: 'danger' },
    projected: { label: '已立项', theme: 'success' },
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
    postponed: { label: '已改期', theme: 'warning' },
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
  },
  column: {
    enabled: { label: '启用', theme: 'success' },
    disabled: { label: '停用', theme: 'default' },
  },
  announcement: {
    published: { label: '已发布', theme: 'success' },
    withdrawn: { label: '已下架', theme: 'default' },
  },
} as const

export type StatusEntity = keyof typeof statusMap

/* 申请类型映射（五类：企业入驻 / 个体入驻 / 企业合作 / 身份绑定 / 企业退驻） */
export const applicationTypeMap: Record<string, { label: string; theme: 'default' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  settle: { label: '企业入驻', theme: 'primary' },
  individual: { label: '个体入驻', theme: 'primary' },
  cooperation: { label: '企业合作', theme: 'primary' },
  identity: { label: '身份绑定', theme: 'primary' },
  exit: { label: '企业退驻', theme: 'warning' },
}

/* 展示页发布申请目标类型：企业 / 个人 */
export const showcaseTargetTypeMap: Record<string, { label: string; theme: 'default' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  enterprise: { label: '企业展示页', theme: 'primary' },
  individual: { label: '个人主页', theme: 'primary' },
}

/* 选项词汇表（页面统一取用，禁止自造文案） */

export const goodsCategoryMap: Record<string, string> = {
  GC001: '实物商品',
  GC002: '虚拟服务',
  GC003: '权益券',
  physical: '实物商品',
  virtual: '虚拟服务',
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
