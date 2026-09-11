import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getAllPermissionCodes } from '@/constants/permissions'

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
      redirect: '/dashboard',
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
        {
          path: 'rules/ledger',
          component: () => import('@/views/mall/MallLedgerPanel.vue'),
          meta: { title: '积分发放记录', group: '规则管理' },
        },
        {
          path: 'rules/experience-records',
          component: () => import('@/views/rules/ExperienceRecordsPanel.vue'),
          meta: { title: '经验值发放记录', group: '规则管理' },
        },
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
          path: 'contents/showcase',
          component: () => import('@/views/contents/ShowcaseView.vue'),
          meta: { title: '展示页发布', group: '内容管理' },
        },
        {
          path: 'contents/announcements',
          component: () => import('@/views/contents/AnnouncementsPanel.vue'),
          meta: { title: '公告栏', group: '内容管理' },
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
          path: 'logs/audit',
          component: () => import('@/views/system/AuditLogPanel.vue'),
          meta: { title: '审计日志', group: '系统管理' },
        },
        {
          path: 'logs/login',
          component: () => import('@/views/system/LoginLogsPanel.vue'),
          meta: { title: '登录日志', group: '系统管理', perm: '/logs/login' },
        },
        {
          path: 'system/roles',
          component: () => import('@/views/system/RolePanel.vue'),
          meta: { title: '角色权限', group: '系统管理' },
        },
        {
          path: 'system/admins',
          component: () => import('@/views/system/AdminPanel.vue'),
          meta: { title: '管理员账号', group: '系统管理' },
        },
        {
          path: 'system/change-password',
          component: () => import('@/views/system/ChangePasswordView.vue'),
          meta: { title: '修改密码', group: '系统管理' },
        },
        {
          path: 'system/sessions',
          component: () => import('@/views/system/SessionPanel.vue'),
          meta: { title: '在线会话', group: '系统管理' },
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
          path: '403',
          component: () => import('@/views/system/ForbiddenView.vue'),
          meta: { title: '无权限' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

/* 路由守卫：未登录一律回登录页
 * 直接读 localStorage（token 唯一持久化事实源）：http.ts 收到 401 时会先清 token 再跳登录，
 * Pinia state 是启动快照无法感知，读 store 会把 /login 误重定向回 /dashboard */
router.beforeEach((to) => {
  const logged = !!localStorage.getItem('joinyuu_admin_token')
  if (to.path !== '/login' && !logged) {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.path === '/login' && logged) {
    return '/dashboard'
  }
  /* RBAC：路由级权限校验（meta.perm 优先，否则按权限目录推导），无权限落地 /403 */
  const perm = (to.meta.perm as string | undefined) ?? requiredPerm(to.path)
  if (logged && perm) {
    const auth = useAuthStore()
    if (!auth.hasPerm(perm)) return { path: '/403' }
  }
  return true
})

export default router
