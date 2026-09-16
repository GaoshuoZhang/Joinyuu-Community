/** v38：页面标题映射（AppShell 标题与 document.title 共用，前缀最长优先匹配）。 */
export const PAGE_TITLES: [string, string][] = [
  ['/search', '全局搜索'],
  ['/me/cards/individual', '个人名片'],
  ['/me/tasks', '积分任务'],
  ['/me/stats', '数据看板'],
  ['/me/services', '服务申请'],
  ['/mall/rules', '积分规则'],
  ['/workbench', '企业工作台'],
  ['/ticket', '活动电子票'],
  ['/messages', '需求沟通'],
  ['/collab', '项目协作'],
  ['/me/projects/', '项目详情'],
  ['/me/identities', '关联身份'],
  ['/me/invitations', '企业邀请'],
  ['/me/enterprises', '企业详情'],
  ['/me/profile/edit', '编辑资料'],
  ['/me/realname', '实名认证'],
  ['/me/applications', '我的申请'],
  ['/me/reservations', '我的预约'],
  ['/me/enrollments', '我的报名'],
  ['/me/responses', '我的响应'],
  ['/me/experience', '我的等级'],
  ['/me/demands', '我的需求'],
  ['/me/projects/', '项目详情'],
  ['/me/projects', '我的项目'],
  ['/me/favorites', '我的收藏'],
  ['/me/history', '浏览历史'],
  ['/me/addresses', '收货地址'],
  ['/me/security', '账号与安全'],
  ['/privacy', '用户协议与隐私政策'],
  ['/me/articles', '我的投稿'],
  ['/me/orders', '我的订单'],
  ['/me/points', '我的积分'],
  ['/check-in', '签到'],
  ['/events', '活动计划'],
  ['/spaces/reserve', '预约提交'],
  ['/spaces', '空间预约'],
  ['/mall', '积分商城'],
  ['/articles/new', '文章投稿'],
  ['/articles', '社区内容'],
  ['/talents', '个人名片'],
  ['/intros/enterprise', '企业合作'],
  ['/intros/settle', '企业入驻'],
  ['/intros/cooperation', '合作伙伴'],
  ['/intros/talent', '人才登记'],
  ['/demands/new/task', '找服务'],
  ['/demands/new/invest', '找投资'],
  ['/demands/new/cooperation', '找合作'],
  ['/demands/new', '发布需求'],
  ['/demands', '项目详情'],
  ['/showcase-apply', '企业名片申请'],
  ['/enterprises', '企业名片'],
  ['/applications/settle', '企业入驻申请'],
  ['/applications/cooperation', '合作伙伴申请'],
  ['/applications/individual', '人才登记申请'],
  ['/applications/new', '身份绑定申请'],
  ['/notices', '站内信'],
]

/** 按路径取页面标题（Tab 根路径返回空字符串，由壳层展示站点名） */
export function pageTitleFor(path: string): string {
  if (['/', '/projects', '/community', '/plaza', '/me'].includes(path)) return ''
  /* 编辑企业名片 / 成员管理：需先于 /me/enterprises 前缀命中 */
  if (/^\/me\/enterprises\/[^/]+\/edit$/.test(path)) return '编辑企业名片'
  if (/^\/me\/enterprises\/[^/]+\/members\//.test(path)) return '成员管理'
  for (const [prefix, title] of PAGE_TITLES) {
    if (path.includes(prefix)) return title
  }
  return ''
}
