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
          component: () => import('@/views/coming-soon/ComingSoonView.vue'),
          meta: {
            title: '积分商城',
            group: '运营设施',
            planned: ['积分规则配置', '商品上下架', '兑换订单管理', '积分流水查询'],
          },
        },
        {
          path: 'workstations',
          component: () => import('@/views/coming-soon/ComingSoonView.vue'),
          meta: {
            title: '办公位管理',
            group: '运营设施',
            planned: ['工位平面图', '工位分配与回收', '租约管理', '续约提醒'],
          },
        },
        {
          path: 'spaces',
          component: () => import('@/views/coming-soon/ComingSoonView.vue'),
          meta: {
            title: '公共空间',
            group: '运营设施',
            planned: ['空间与时段管理', '空间预约申请审批', '使用情况看板', '设备管理'],
          },
        },
        {
          path: 'contents',
          component: () => import('@/views/coming-soon/ComingSoonView.vue'),
          meta: {
            title: '资讯内容',
            group: '运营设施',
            planned: ['文章管理', '栏目管理', '展示页发布（企业/个人）', '发布审核', '阅读数据统计'],
          },
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
