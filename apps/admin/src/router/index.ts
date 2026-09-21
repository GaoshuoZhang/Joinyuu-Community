import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getAllPermissionCodes } from '@/constants/permissions'
import { scopeAllowsGroup } from '@/constants/scopes'

/* 权限码集合：路由守卫据此推导菜单/详情路由所需权限（与 constants/permissions 目录同步） */
const ALL_PERMS = new Set(getAllPermissionCodes())

/** 由路径推导所需权限码：优先精确匹配，其次逐级回退（/users/U1001 → /users） */
function requiredPerm(path: string): string | undefined {
  const parts = path.split('/').filter(Boolean)
  for (let i = parts.length; i > 0; i--) {
    const code = `/${parts.slice(0, i).join('/')}`
    if (ALL_PERMS.has(code)) return code
  }
  return undefined
}

/** 首个可访问路由：登录成功与兜底跳转的目标，避免无 /dashboard 权限的账号必然落地 403。
 * 按路由注册顺序取第一个「有标题、非参数化、权限与数据范围均放行」的静态路由；全不可访问时返回 /403 */
export function firstAccessiblePath(): string {
  const auth = useAuthStore()
  for (const record of router.getRoutes()) {
    const path = record.path
    if (!record.meta?.title || path.includes(':') || path === '/login') continue
    const perm = (record.meta.perm as string | string[] | undefined) ?? requiredPerm(path)
    if (perm && !auth.hasPerm(perm)) continue
    const group = record.meta.group as string | undefined
    const scopeDomain = record.meta.scopeDomain as string | undefined
    if (group && !scopeAllowsGroup(auth.dataScope, auth.permissions, group, scopeDomain)) continue
    return path
  }
  return '/403'
}

/* 路由表（冻结）：所有页面路由预注册，页面组件仅填充 AdminLayout 的 router-view */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/LoginView.vue'),
      meta: { title: '登录' },
    },
    /* 打印视图：独立于 AdminLayout 的裸页（window.print 输出干净纸张） */
    {
      path: '/prints/lease/:id',
      component: () => import('@/views/workstations/LeasePrintView.vue'),
      meta: { title: '租约打印', perm: '/workstations/leases' },
    },
    {
      path: '/prints/approval/:id',
      component: () => import('@/views/approvals/ApprovalPrintView.vue'),
      meta: { title: '审核单打印', perm: '/approvals' },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      redirect: () => firstAccessiblePath(),
      children: [
        {
          path: 'dashboard',
          component: () => import('@/views/dashboard/DashboardView.vue'),
          meta: { title: '工作台' },
        },
        {
          path: 'users',
          component: () => import('@/views/users/UserListView.vue'),
          meta: { title: '用户管理', group: '社区成员' },
        },
        {
          path: 'users/:id',
          component: () => import('@/views/users/UserDetailView.vue'),
          meta: { title: '用户详情', group: '社区成员' },
        },
        {
          path: 'individuals',
          component: () => import('@/views/individuals/IndividualListView.vue'),
          meta: { title: '社区个体', group: '社区成员' },
        },
        {
          path: 'enterprises',
          component: () => import('@/views/enterprises/EnterpriseListView.vue'),
          meta: { title: '社区企业', group: '社区成员' },
        },
        {
          path: 'enterprises/:id',
          component: () => import('@/views/enterprises/EnterpriseDetailView.vue'),
          meta: { title: '企业详情', group: '社区成员' },
        },
        {
          path: 'external-enterprises',
          component: () => import('@/views/external-enterprises/ExternalEnterpriseListView.vue'),
          meta: { title: '合作企业', group: '社区成员' },
        },
        {
          path: 'external-enterprises/:id',
          component: () => import('@/views/external-enterprises/ExternalEnterpriseDetailView.vue'),
          meta: { title: '合作企业详情', group: '社区成员' },
        },
        {
          path: 'approvals',
          component: () => import('@/views/approvals/ApprovalListView.vue'),
          meta: { title: '申请审核', group: '社区成员' },
        },
        { path: 'application-form-config', redirect: '/system/application-form-config' },
        { path: 'member-governance', redirect: '/system/deletion-requests' },
        { path: 'card-management', component: () => import('@/views/users/CardManagementView.vue'), meta: { title: '名片管理', group: '社区成员', perm: '/card-management' } },
        {
          path: 'demands',
          component: () => import('@/views/demands/DemandListView.vue'),
          meta: { title: '需求管理', group: '业务运营' },
        },
        {
          path: 'demands/review',
          component: () => import('@/views/demands/DemandReviewView.vue'),
          meta: { title: '需求审核', group: '业务运营' },
        },
        {
          path: 'demands/:id',
          component: () => import('@/views/demands/DemandDetailView.vue'),
          meta: { title: '需求详情', group: '业务运营' },
        },
        {
          path: 'projects',
          component: () => import('@/views/projects/ProjectListView.vue'),
          meta: { title: '项目管理', group: '业务运营' },
        },
        {
          path: 'projects/:id',
          component: () => import('@/views/projects/ProjectDetailView.vue'),
          meta: { title: '项目详情', group: '业务运营' },
        },
        {
          path: 'events',
          component: () => import('@/views/events/EventListView.vue'),
          meta: { title: '活动管理', group: '业务运营' },
        },
        {
          path: 'events/enrollments',
          component: () => import('@/views/events/EventEnrollmentReviewView.vue'),
          meta: { title: '活动报名', group: '业务运营', perm: '/events' },
        },
        {
          path: 'events/:id',
          component: () => import('@/views/events/EventDetailView.vue'),
          meta: { title: '活动详情', group: '业务运营' },
        },
        {
          path: 'mall',
          redirect: '/mall/goods',
        },
        {
          path: 'mall/goods',
          component: () => import('@/views/mall/MallGoodsPanel.vue'),
          meta: { title: '商品管理', group: '积分管理' },
        },
        {
          path: 'mall/orders',
          component: () => import('@/views/mall/MallOrdersPanel.vue'),
          meta: { title: '订单管理', group: '积分管理' },
        },
        { path: 'rules/ledger', component: () => import('@/views/mall/MallLedgerPanel.vue'), meta: { title: '积分发放记录', group: '规则管理' } },
        { path: 'rules/experience-records', component: () => import('@/views/rules/ExperienceRecordsPanel.vue'), meta: { title: '经验值发放记录', group: '规则管理' } },
        {
          path: 'rules/points',
          component: () => import('@/views/mall/MallRulesPanel.vue'),
          meta: { title: '积分规则', group: '规则管理' },
        },
        {
          path: 'rules/experience',
          component: () => import('@/views/rules/ExperienceRulesPanel.vue'),
          meta: { title: '经验值规则', group: '规则管理' },
        },
        {
          path: 'rules/levels',
          component: () => import('@/views/rules/LevelTiersPanel.vue'),
          meta: { title: '等级规则', group: '规则管理' },
        },
        {
          path: 'rules/publishing-limits',
          component: () => import('@/views/rules/PublishLimitsPanel.vue'),
          meta: { title: '发布限制', group: '规则管理', perm: '/rules/publishing-limits' },
        },
        {
          path: 'workstations',
          component: () => import('@/views/workstations/WorkstationMapPanel.vue'),
          meta: { title: '办公位管理', group: '空间管理' },
        },
        {
          path: 'workstations/offices',
          component: () => import('@/views/workstations/OfficeListPanel.vue'),
          meta: { title: '办公室管理', group: '空间管理' },
        },
        {
          path: 'workstations/leases',
          component: () => import('@/views/workstations/LeasePanel.vue'),
          meta: { title: '租赁管理', group: '空间管理' },
        },
        {
          path: 'workstations/leases/:id',
          component: () => import('@/views/workstations/LeaseDetailView.vue'),
          meta: { title: '租赁详情', group: '空间管理' },
        },
        {
          path: 'spaces',
          component: () => import('@/views/spaces/SpaceListPanel.vue'),
          meta: { title: '公共空间管理', group: '空间管理' },
        },
        {
          path: 'spaces/reservations',
          component: () => import('@/views/spaces/ReservationPanel.vue'),
          meta: { title: '公共空间预约', group: '空间管理' },
        },
        {
          path: 'spaces/:id',
          component: () => import('@/views/spaces/SpaceDetailView.vue'),
          meta: { title: '空间详情', group: '空间管理' },
        },
        {
          path: 'contents/publish',
          component: () => import('@/views/contents/ArticlePublishPanel.vue'),
          meta: { title: '资讯发布', group: '内容管理', perm: '/contents/publish' },
        },
        {
          path: 'contents/submissions',
          component: () => import('@/views/contents/ArticleSubmissionPanel.vue'),
          meta: { title: '投稿内容', group: '内容管理', perm: '/contents/submissions' },
        },
        {
          path: 'contents/columns',
          component: () => import('@/views/contents/ColumnPanel.vue'),
          meta: { title: '栏目管理', group: '内容管理', perm: '/contents/columns' },
        },
        {
          path: 'contents/stats',
          component: () => import('@/views/contents/ReadStatsPanel.vue'),
          meta: { title: '阅读统计', group: '内容管理', perm: '/contents/stats' },
        },
        {
          path: 'contents/policies',
          component: () => import('@/views/contents/CommunityPolicyView.vue'),
          meta: { title: '社区政策', group: '内容管理', perm: '/contents/policies' },
        },
        {
          path: 'contents/banners',
          component: () => import('@/views/contents/BannerPanel.vue'),
          meta: { title: '轮播图管理', group: '内容管理', perm: '/contents/banners' },
        },
        {
          path: 'contents/announcements',
          component: () => import('@/views/contents/AnnouncementsPanel.vue'),
          meta: { title: '首页公告', group: '内容管理' },
        },
        {
          path: 'system/dicts',
          component: () => import('@/views/system/DictPanel.vue'),
          meta: { title: '数据字典', group: '系统管理' },
        },
        {
          path: 'system/config',
          component: () => import('@/views/system/SystemConfigPanel.vue'),
          meta: { title: '系统配置', group: '系统管理' },
        },
        {
          path: 'system/application-form-config',
          component: () => import('@/views/approvals/ApplicationFormConfigView.vue'),
          meta: { title: '申请表单配置', group: '系统管理', perm: '/approvals', scopeDomain: 'members' },
        },
        {
          path: 'system/deletion-requests',
          component: () => import('@/views/system/DeletionRequestsView.vue'),
          meta: { title: '注销工单', group: '系统管理', perm: '/member-governance', scopeDomain: 'members' },
        },
        {
          path: 'system/logs',
          component: () => import('@/views/system/LogAuditView.vue'),
          meta: { title: '日志与审计', group: '系统管理', perm: ['/logs/audit', '/logs/login'] },
        },
        /* 旧路径兼容：迁移到「日志与审计」「角色与账号」选项卡页 */
        { path: 'logs/audit', redirect: '/system/logs?tab=audit' },
        { path: 'logs/login', redirect: '/system/logs?tab=login' },
        {
          path: 'system/account',
          component: () => import('@/views/system/AccountRoleView.vue'),
          meta: { title: '角色与账号', group: '系统管理', perm: ['/system/admins', '/system/roles', '/system/sessions'] },
        },
        { path: 'system/roles', redirect: '/system/account?tab=roles' },
        { path: 'system/admins', redirect: '/system/account?tab=admins' },
        { path: 'system/sessions', redirect: '/system/account?tab=sessions' },
        {
          path: 'system/change-password',
          component: () => import('@/views/system/ChangePasswordView.vue'),
          meta: { title: '修改密码', group: '系统管理' },
        },
        {
          path: 'assets/library',
          component: () => import('@/views/system/AssetLibrary.vue'),
          meta: { title: '素材库', group: '系统管理', perm: '/system/assets' },
        },
        {
          path: 'system/monitor',
          component: () => import('@/views/system/MonitorPanel.vue'),
          meta: { title: '系统监控', group: '系统管理', perm: '/system/monitor' },
        },
        {
          path: 'system/trash',
          component: () => import('@/views/system/ArchivePanel.vue'),
          meta: { title: '归档管理', group: '系统管理', perm: '/system/trash' },
        },
        {
          path: 'system/policies',
          component: () => import('@/views/system/AgreementPolicyView.vue'),
          meta: { title: '协议与政策', group: '系统管理', perm: '/system/policies' },
        },
        {
          path: 'system/messages',
          component: () => import('@/views/system/MessageCenterView.vue'),
          meta: { title: '消息中心', group: '系统管理', perm: '/system/messages' },
        },
        {
          path: '403',
          component: () => import('@/views/system/ForbiddenView.vue'),
          meta: { title: '无权限' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: () => firstAccessiblePath() },
  ],
})

/* 路由守卫：未登录一律回登录页
 * 直接读 localStorage（token 唯一持久化事实源）：http.ts 收到 401 时会先清 token 再跳登录，
 * Pinia state 是启动快照无法感知，读 store 会把 /login 误重定向回 /dashboard */
router.beforeEach((to) => {
  document.documentElement.dataset.routeLoading = 'true'
  const logged = !!localStorage.getItem('joinyuu_admin_token')
  if (to.path !== '/login' && !logged) {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.path === '/login' && logged) {
    return firstAccessiblePath()
  }
  /* RBAC：路由级权限校验（meta.perm 优先，否则按权限目录推导；支持数组 any-of），无权限落地 /403 */
  const perm = (to.meta.perm as string | string[] | undefined) ?? requiredPerm(to.path)
  if (logged) {
    const auth = useAuthStore()
    if (perm && !auth.hasPerm(perm)) return { path: '/403' }
    /* 数据范围：登录页/403/打印与无 group 路由放行；范围非空且不含该域 → /403 */
    const group = to.meta.group as string | undefined
    const scopeDomain = to.meta.scopeDomain as string | undefined
    if (group && !scopeAllowsGroup(auth.dataScope, auth.permissions, group, scopeDomain)) return { path: '/403' }
  }
  return true
})

function finishRouteLoading() {
  delete document.documentElement.dataset.routeLoading
}

router.afterEach(finishRouteLoading)
router.onError(finishRouteLoading)

export default router
