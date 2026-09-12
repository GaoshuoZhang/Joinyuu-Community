import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/** M2 移动端路由表（纯移动端，2026-09-13 移除桌面端后直连 mobile 视图）。
 * 底部 5 Tab：首页 / 项目 / 社区 / 广场 / 我的（见 m2-client-plan §5.3 重构说明）。
 * /me/**、提交类、入驻说明跳转需登录（requiresAuth）；未列出路径由 catchAll 兜底回首页。 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    /* 壳外独立页 */
    { path: '/login', name: 'login', component: () => import('@/views/mobile/LoginView.vue'), meta: { guestOnly: true } },
    { path: '/register', name: 'register', component: () => import('@/views/mobile/RegisterView.vue'), meta: { guestOnly: true } },

    /* 壳内页面（底部 Tab 结构） */
    {
      path: '/',
      component: () => import('@/views/mobile/AppShell.vue'),
      children: [
        /* ---- 底部 Tab ---- */
        { path: '', name: 'home', component: () => import('@/views/mobile/HomeView.vue') },
        { path: 'projects', name: 'projects', component: () => import('@/views/mobile/ProjectsView.vue') },
        { path: 'community', name: 'community', component: () => import('@/views/mobile/CommunityView.vue') },
        { path: 'plaza', name: 'plaza', component: () => import('@/views/mobile/PlazaView.vue') },
        { path: 'me', name: 'me', component: () => import('@/views/mobile/MeView.vue'), meta: { requiresAuth: true } },

        /* ---- 需求发布 / 详情（项目语境）---- */
        { path: 'demands/new', name: 'demand-new', component: () => import('@/views/mobile/DemandNewView.vue'), meta: { requiresAuth: true } },
        { path: 'demands/:id', name: 'demand-detail', component: () => import('@/views/mobile/DemandDetailView.vue') },

        /* ---- 入驻说明（企业入驻 / 人才登记）---- */
        { path: 'intros/:kind', name: 'intro', component: () => import('@/views/mobile/IntroView.vue') },

        /* ---- 活动 ---- */
        { path: 'events', name: 'events', component: () => import('@/views/mobile/EventsView.vue') },
        { path: 'events/:id', name: 'event-detail', component: () => import('@/views/mobile/EventDetailView.vue') },
        { path: 'events/:id/check-in', name: 'event-checkin', component: () => import('@/views/mobile/CheckInView.vue'), meta: { requiresAuth: true } },

        /* ---- 积分商城 ---- */
        { path: 'mall', name: 'mall', component: () => import('@/views/mobile/MallView.vue') },
        { path: 'mall/:id', name: 'mall-detail', component: () => import('@/views/mobile/MallDetailView.vue'), meta: { requiresAuth: true } },

        /* ---- 空间预约 ---- */
        { path: 'spaces', name: 'spaces', component: () => import('@/views/mobile/SpacesView.vue') },
        { path: 'spaces/:id/reserve', name: 'space-reserve', component: () => import('@/views/mobile/SpaceReserveView.vue'), meta: { requiresAuth: true } },

        /* ---- 内容与展示页 ---- */
        { path: 'articles', name: 'articles', component: () => import('@/views/mobile/ArticlesView.vue') },
        { path: 'articles/new', name: 'article-new', component: () => import('@/views/mobile/ArticleNewView.vue'), meta: { requiresAuth: true } },
        { path: 'articles/:id', name: 'article-detail', component: () => import('@/views/mobile/ArticleDetailView.vue') },
        { path: 'enterprises/:id', name: 'enterprise-showcase', component: () => import('@/views/mobile/EnterpriseShowcaseView.vue') },
        { path: 'enterprises/:id/showcase-apply', name: 'showcase-apply', component: () => import('@/views/mobile/ShowcaseApplyView.vue'), meta: { requiresAuth: true } },

        /* ---- 站内信 [MOCK-ONLY] ---- */
        { path: 'notices', name: 'notices', component: () => import('@/views/mobile/NoticesView.vue'), meta: { requiresAuth: true } },

        /* ---- 个人中心 ---- */
        { path: 'me/profile/edit', name: 'me-profile', component: () => import('@/views/mobile/ProfileEditView.vue'), meta: { requiresAuth: true } },
        { path: 'me/points', name: 'me-points', component: () => import('@/views/mobile/PointsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/experience', name: 'me-experience', component: () => import('@/views/mobile/ExperienceView.vue'), meta: { requiresAuth: true } },
        { path: 'me/demands', name: 'me-demands', component: () => import('@/views/mobile/MyDemandsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/responses', name: 'me-responses', component: () => import('@/views/mobile/MyResponsesView.vue'), meta: { requiresAuth: true } },
        { path: 'me/enrollments', name: 'me-enrollments', component: () => import('@/views/mobile/MyEnrollmentsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/orders', name: 'me-orders', component: () => import('@/views/mobile/MyOrdersView.vue'), meta: { requiresAuth: true } },
        { path: 'me/reservations', name: 'me-reservations', component: () => import('@/views/mobile/MyReservationsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/articles', name: 'me-articles', component: () => import('@/views/mobile/MyArticlesView.vue'), meta: { requiresAuth: true } },
        { path: 'me/applications', name: 'me-applications', component: () => import('@/views/mobile/MyApplicationsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/projects', name: 'me-projects', component: () => import('@/views/mobile/MyProjectsView.vue'), meta: { requiresAuth: true } },
        { path: 'applications/new', name: 'application-new', component: () => import('@/views/mobile/ApplicationNewView.vue'), meta: { requiresAuth: true } },
      ],
    },

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ensureRestored()
  /* guestOnly：已登录访问登录/注册 → 回首页 */
  if (to.meta.guestOnly && auth.isLogged) return { path: '/' }
  /* 登录后页：未登录跳登录并带 redirect */
  if (to.meta.requiresAuth && !auth.isLogged) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})