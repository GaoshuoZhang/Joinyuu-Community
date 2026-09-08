import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

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
          meta: { title: '社区个人', group: '社区成员' },
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
          meta: { title: '外部企业', group: '社区成员' },
        },
        {
          path: 'external-enterprises/:id',
          component: () => import('@/views/external-enterprises/ExternalEnterpriseDetailView.vue'),
          meta: { title: '外部企业详情', group: '社区成员' },
        },
        {
          path: 'approvals',
          component: () => import('@/views/approvals/ApprovalListView.vue'),
          meta: { title: '申请审批', group: '社区成员' },
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
          path: 'mall/rules',
          component: () => import('@/views/mall/MallRulesPanel.vue'),
          meta: { title: '积分规则', group: '积分管理' },
        },
        {
          path: 'mall/ledger',
          component: () => import('@/views/mall/MallLedgerPanel.vue'),
          meta: { title: '积分账单', group: '积分管理' },
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
          path: 'contents',
          component: () => import('@/views/contents/ContentsView.vue'),
          meta: { title: '资讯内容', group: '运营设施' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

/* 路由守卫：未登录一律回登录页 */
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.path !== '/login' && !auth.isLogged) {
    return { path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.path === '/login' && auth.isLogged) {
    return '/dashboard'
  }
  return true
})

export default router
