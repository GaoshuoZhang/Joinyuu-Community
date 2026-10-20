type QueryValue = string | null | (string | null)[] | undefined

export interface PageTitleRoute {
  name?: string | symbol | null
  query?: Record<string, QueryValue>
}

const ROUTE_TITLES: Record<string, string> = {
  login: '登录或注册',
  register: '注册',
  'forgot-password': '找回密码',
  home: '首页',
  'global-search': '全局搜索',
  projects: '需求',
  community: '社区',
  plaza: '广场',
  me: '我的',
  'my-stats': '数据看板',
  'me-messages': '我的留言',
  'demand-new': '发布需求',
  'demand-new-task': '找服务',
  'demand-new-invest': '找投资',
  'demand-new-cooperation': '找合作',
  'demand-detail': '需求详情',
  'intro-enterprise': '企业合作',
  'intro-settle': '企业入驻',
  'intro-cooperation': '合作伙伴',
  'intro-talent': '人才登记',
  'event-detail': '活动详情',
  'event-checkin': '活动签到',
  mall: '积分商城',
  'points-rules': '积分规则',
  'mall-detail': '商品详情',
  spaces: '空间预约',
  'space-reserve': '预约提交',
  'article-new': '文章投稿',
  'article-detail': '文章详情',
  'talent-card': '个人名片',
  'enterprise-showcase': '企业名片',
  notices: '站内信',
  'my-card-individual': '个人名片',
  'my-identities': '关联身份',
  'identity-guide': '身份说明',
  'invitation-detail': '企业邀请',
  'my-enterprise-card-edit': '编辑企业名片',
  'my-enterprise-member': '成员管理',
  'my-enterprise-detail': '企业详情',
  'me-profile': '编辑资料',
  'me-realname': '实名认证',
  'me-points': '我的积分',
  'me-experience': '我的等级',
  'me-demands': '我的需求',
  'me-responses': '我的响应',
  'me-enrollments': '我的报名',
  'me-orders': '我的订单',
  'my-order-detail': '订单详情',
  'me-reservations': '我的预约',
  'my-reservation-detail': '预约详情',
  'me-leases': '工位租约',
  'me-articles': '我的投稿',
  'my-article-detail': '投稿详情',
  'me-favorites': '我的收藏',
  'me-history': '浏览历史',
  'me-security': '账号与安全',
  'me-records': '我的记录',
  'me-notification-settings': '通知设置',
  'me-about': '关于',
  privacy: '用户协议与隐私政策',
  'me-applications': '我的申请',
  'my-application-detail': '申请详情',
  'me-projects': '我的项目',
  'my-project-detail': '项目详情',
  'application-settle': '企业入驻申请',
  'application-cooperation': '合作伙伴申请',
  'application-individual': '人才登记申请',
}

const QUERY_TITLES: Record<string, Record<string, string>> = {
  projects: {
    task: '找服务',
    investment: '找投资',
    cooperation: '找合作',
  },
  community: {
    service: '社区服务',
    talent: '人才库',
    enterprise: '企业库',
  },
  plaza: {
    events: '活动',
    articles: '资讯',
  },
}

function queryString(value: QueryValue): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

/** Resolve a title from the matched route, never from incidental path fragments. */
export function pageTitleFor(route: PageTitleRoute): string {
  const name = typeof route.name === 'string' ? route.name : ''
  const queryKey = name === 'projects' ? 'kind' : name === 'community' || name === 'plaza' ? 'tab' : ''
  if (queryKey) {
    const queryTitle = QUERY_TITLES[name]?.[queryString(route.query?.[queryKey])]
    if (queryTitle) return queryTitle
  }
  return ROUTE_TITLES[name] ?? ''
}

export function documentTitleFor(route: PageTitleRoute, siteName: string): string {
  const resolvedSiteName = siteName.trim() || '聚屿社区'
  const pageTitle = pageTitleFor(route)
  return pageTitle ? `${pageTitle} · ${resolvedSiteName}` : resolvedSiteName
}
