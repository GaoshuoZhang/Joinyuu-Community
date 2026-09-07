/* 状态映射（冻结）：所有页面统一经 StatusTag 组件消费，禁止自造状态文案/配色 */

export interface StatusConf {
  label: string
  theme: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}

export const statusMap = {
  user: {
    active: { label: '正常', theme: 'success' },
    frozen: { label: '已冻结', theme: 'danger' },
    pending: { label: '待激活', theme: 'warning' },
  },
  enterprise: {
    active: { label: '已入驻', theme: 'success' },
    pending: { label: '入驻审核中', theme: 'warning' },
    exited: { label: '已退出', theme: 'default' },
  },
  showcase: {
    published: { label: '已发布', theme: 'success' },
    pending: { label: '待审核', theme: 'warning' },
    rejected: { label: '已驳回', theme: 'danger' },
    none: { label: '未提交', theme: 'default' },
  },
  application: {
    pending: { label: '待审批', theme: 'warning' },
    approved: { label: '已通过', theme: 'success' },
    rejected: { label: '已驳回', theme: 'danger' },
  },
  demand: {
    draft: { label: '草稿', theme: 'default' },
    pending: { label: '待审核', theme: 'warning' },
    pending_release: { label: '待发布', theme: 'primary' },
    published: { label: '已发布', theme: 'success' },
    rejected: { label: '已驳回', theme: 'danger' },
    projected: { label: '已立项', theme: 'success' },
    closed: { label: '已关闭', theme: 'default' },
  },
  project: {
    recruiting: { label: '招募中', theme: 'primary' },
    running: { label: '进行中', theme: 'success' },
    paused: { label: '已暂停', theme: 'warning' },
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
  },
} as const

export type StatusEntity = keyof typeof statusMap

export const applicationTypeMap: Record<string, { label: string; theme: 'default' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  settle: { label: '入驻申请', theme: 'primary' },
  showcase: { label: '展示页发布', theme: 'primary' },
  space: { label: '空间预约', theme: 'primary' },
  identity: { label: '身份绑定', theme: 'primary' },
}
