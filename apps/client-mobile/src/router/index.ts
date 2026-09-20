import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/** M2 移动端路由表（纯移动端，2026-09-13 移除桌面端后直连 mobile 视图）。
 * 底部 5 Tab：首页 / 项目 / 社区 / 广场 / 我的。
 * /me/**、提交类、入驻说明跳转需登录（requiresAuth）；未列出路径由 catchAll 兜底回首页。 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    /* 壳外独立页 */
    { path: '/login', name: 'login', component: () => import('@/views/mobile/LoginView.vue'), meta: { guestOnly: true } },
    { path: '/register', name: 'register', component: () => import('@/views/mobile/RegisterView.vue'), meta: { guestOnly: true } },
    { path: '/forgot-password', name: 'forgot-password', component: () => import('@/views/mobile/ForgotPasswordView.vue') },

    /* 壳内页面（底部 Tab 结构） */
    {
      path: '/',
      component: () => import('@/views/mobile/AppShell.vue'),
      children: [
        /* ---- 底部 Tab ---- */
        { path: '', name: 'home', component: () => import('@/views/mobile/HomeView.vue'), meta: { keepAlive: true } },
        { path: 'search', name: 'global-search', component: () => import('@/views/mobile/GlobalSearchView.vue'), meta: { keepAlive: true } },
        { path: 'projects', name: 'projects', component: () => import('@/views/mobile/ProjectsView.vue'), meta: { keepAlive: true } },
        { path: 'community', name: 'community', component: () => import('@/views/mobile/CommunityView.vue'), meta: { keepAlive: true } },
        { path: 'plaza', name: 'plaza', component: () => import('@/views/mobile/PlazaView.vue'), meta: { keepAlive: true } },
        { path: 'me', name: 'me', component: () => import('@/views/mobile/MeView.vue'), meta: { requiresAuth: true, keepAlive: true } },
        { path: 'me/stats', name: 'my-stats', component: () => import('@/views/mobile/MyStatsView.vue'), meta: { requiresAuth: true } },

        /* ---- 需求发布（类型 hub + 独立表单）/ 详情（项目语境）---- */
        { path: 'demands/new', name: 'demand-new', component: () => import('@/views/mobile/DemandPublishHubView.vue'), meta: { requiresAuth: true } },
        { path: 'demands/new/task', name: 'demand-new-task', component: () => import('@/views/mobile/DemandTaskFormView.vue'), meta: { requiresAuth: true } },
        { path: 'demands/new/invest', name: 'demand-new-invest', component: () => import('@/views/mobile/DemandInvestFormView.vue'), meta: { requiresAuth: true } },
        { path: 'demands/new/cooperation', name: 'demand-new-cooperation', component: () => import('@/views/mobile/DemandCoopFormView.vue'), meta: { requiresAuth: true } },
        { path: 'demands/:id', name: 'demand-detail', component: () => import('@/views/mobile/DemandDetailView.vue') },

        /* ---- 企业合作 / 人才登记（独立流程介绍页）---- */
        { path: 'intros/enterprise', name: 'intro-enterprise', component: () => import('@/views/mobile/EnterpriseCoopView.vue') },
        { path: 'intros/settle', name: 'intro-settle', component: () => import('@/views/mobile/IntroView.vue') },
        { path: 'intros/cooperation', name: 'intro-cooperation', component: () => import('@/views/mobile/IntroView.vue') },
        { path: 'intros/talent', name: 'intro-talent', component: () => import('@/views/mobile/IntroView.vue') },

        /* ---- 活动 ---- */
        { path: 'events/:id', name: 'event-detail', component: () => import('@/views/mobile/EventDetailView.vue') },
        { path: 'events/:id/check-in', name: 'event-checkin', component: () => import('@/views/mobile/CheckInView.vue'), meta: { requiresAuth: true } },

        /* ---- 积分商城 ---- */
        { path: 'mall', name: 'mall', component: () => import('@/views/mobile/MallView.vue'), meta: { keepAlive: true } },
        { path: 'mall/rules', name: 'points-rules', component: () => import('@/views/mobile/PointsRulesView.vue') },
        { path: 'mall/:id', name: 'mall-detail', component: () => import('@/views/mobile/MallDetailView.vue') },

        /* ---- 空间预约 ---- */
        { path: 'spaces', name: 'spaces', component: () => import('@/views/mobile/SpacesView.vue'), meta: { keepAlive: true } },
        { path: 'spaces/:id/reserve', name: 'space-reserve', component: () => import('@/views/mobile/SpaceReserveView.vue'), meta: { requiresAuth: true } },

        /* ---- 内容与企业名片 ---- */
        /* v43：独立文章列表页移除，统一走「广场 > 资讯」 */
        { path: 'articles', redirect: '/plaza?tab=articles' },
        { path: 'articles/new', name: 'article-new', component: () => import('@/views/mobile/ArticleNewView.vue'), meta: { requiresAuth: true } },
        { path: 'articles/:id', name: 'article-detail', component: () => import('@/views/mobile/ArticleDetailView.vue') },
        { path: 'talents/:uid', name: 'talent-card', component: () => import('@/views/mobile/TalentCardView.vue') },
        /* talent-card: 公开人才名片（人才库点入） */
        { path: 'enterprises/:id', name: 'enterprise-showcase', component: () => import('@/views/mobile/EnterpriseShowcaseView.vue') },

        /* ---- 站内信 ---- */
        { path: 'notices', name: 'notices', component: () => import('@/views/mobile/NoticesView.vue'), meta: { requiresAuth: true } },

        /* ---- 个人中心 ---- */
        { path: 'me/cards/individual', name: 'my-card-individual', component: () => import('@/views/mobile/MyIndividualCardView.vue'), meta: { requiresAuth: true } },
        { path: 'me/identities', name: 'my-identities', component: () => import('@/views/mobile/IdentityListView.vue'), meta: { requiresAuth: true } },
        /* 企业邀请详情（站内信跳转入，确认加入 / 拒绝） */
        { path: 'me/invitations/:id', name: 'invitation-detail', component: () => import('@/views/mobile/InvitationView.vue'), meta: { requiresAuth: true } },
        { path: 'me/enterprises/:id/edit', name: 'my-enterprise-card-edit', component: () => import('@/views/mobile/EnterpriseCardEditView.vue'), meta: { requiresAuth: true } },
        { path: 'me/enterprises/:id/members/:memberKey', name: 'my-enterprise-member', component: () => import('@/views/mobile/EnterpriseMemberView.vue'), meta: { requiresAuth: true } },
        { path: 'me/enterprises/:id', name: 'my-enterprise-detail', component: () => import('@/views/mobile/EnterpriseDetailView.vue'), meta: { requiresAuth: true } },
        { path: 'me/profile/edit', name: 'me-profile', component: () => import('@/views/mobile/ProfileEditView.vue'), meta: { requiresAuth: true } },
        { path: 'me/realname', name: 'me-realname', component: () => import('@/views/mobile/RealNameView.vue'), meta: { requiresAuth: true } },
        { path: 'me/points', name: 'me-points', component: () => import('@/views/mobile/PointsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/experience', name: 'me-experience', component: () => import('@/views/mobile/ExperienceView.vue'), meta: { requiresAuth: true } },
        { path: 'me/demands', name: 'me-demands', component: () => import('@/views/mobile/MyDemandsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/responses', name: 'me-responses', component: () => import('@/views/mobile/MyResponsesView.vue'), meta: { requiresAuth: true } },
        { path: 'me/enrollments', name: 'me-enrollments', component: () => import('@/views/mobile/MyEnrollmentsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/orders', name: 'me-orders', component: () => import('@/views/mobile/MyOrdersView.vue'), meta: { requiresAuth: true } },
        { path: 'me/orders/:id', name: 'my-order-detail', component: () => import('@/views/mobile/MyOrderDetailView.vue'), meta: { requiresAuth: true } },
        { path: 'me/reservations', name: 'me-reservations', component: () => import('@/views/mobile/MyReservationsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/reservations/:id', name: 'my-reservation-detail', component: () => import('@/views/mobile/MyReservationDetailView.vue'), meta: { requiresAuth: true } },
        { path: 'me/leases', name: 'me-leases', component: () => import('@/views/mobile/MyLeasesView.vue'), meta: { requiresAuth: true } },
        { path: 'me/articles', name: 'me-articles', component: () => import('@/views/mobile/MyArticlesView.vue'), meta: { requiresAuth: true } },
        { path: 'me/articles/:id', name: 'my-article-detail', component: () => import('@/views/mobile/MyArticleDetailView.vue'), meta: { requiresAuth: true } },
        { path: 'me/favorites', name: 'me-favorites', component: () => import('@/views/mobile/MyFavoritesView.vue'), meta: { requiresAuth: true } },
        { path: 'me/history', name: 'me-history', component: () => import('@/views/mobile/HistoryView.vue'), meta: { requiresAuth: true } },
        { path: 'me/addresses', name: 'me-addresses', component: () => import('@/views/mobile/AddressesView.vue'), meta: { requiresAuth: true } },
        { path: 'me/security', name: 'me-security', component: () => import('@/views/mobile/SecurityView.vue'), meta: { requiresAuth: true } },
        { path: 'me/records', name: 'me-records', component: () => import('@/views/mobile/MeRecordsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/settings', name: 'me-settings', component: () => import('@/views/mobile/MeSettingsView.vue'), meta: { requiresAuth: true } },
        { path: 'privacy', name: 'privacy', component: () => import('@/views/mobile/PrivacyView.vue') },
        { path: 'me/applications', name: 'me-applications', component: () => import('@/views/mobile/MyApplicationsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/applications/:id', name: 'my-application-detail', component: () => import('@/views/mobile/MyApplicationDetailView.vue'), meta: { requiresAuth: true } },
        { path: 'me/projects', name: 'me-projects', component: () => import('@/views/mobile/MyProjectsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/projects/:id', name: 'my-project-detail', component: () => import('@/views/mobile/MyProjectDetailView.vue'), meta: { requiresAuth: true } },
        { path: 'applications/settle', name: 'application-settle', component: () => import('@/views/mobile/ApplicationSettleView.vue'), meta: { requiresAuth: true } },
        { path: 'applications/cooperation', name: 'application-cooperation', component: () => import('@/views/mobile/ApplicationCooperationView.vue'), meta: { requiresAuth: true } },
        { path: 'applications/individual', name: 'application-individual', component: () => import('@/views/mobile/ApplicationIndividualView.vue'), meta: { requiresAuth: true } },
      ],
    },

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  /* v36：返回时恢复滚动位置，新页面回到顶部；v40：同会话内 Tab 切换也记住各页滚动位置；v41：仅缓存页参与，避免详情页误用列表位置 */
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (from.name && to.name && from.name !== to.name && to.meta.keepAlive) {
      const remembered = scrollPositions.get(String(to.name))
      if (typeof remembered === 'number') return { top: remembered }
    }
    return { top: 0 }
  },
})

/* v41：按路由名记录滚动位置（仅缓存页；Tab 切换为 push，无浏览器 savedPosition） */
const scrollPositions = new Map<string, number>()
router.beforeEach((_to, from) => {
  if (from.name && from.meta.keepAlive) scrollPositions.set(String(from.name), window.scrollY)
  return true
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

/* v39/v40：仅在路径变化且用户未在输入时聚焦主内容（避免搜索/筛选输入被夺焦、移动端键盘被收起）。 */
let lastPath = ''
let firstNavigation = true

function isEditableFocused(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

router.afterEach((to) => {
  /* 首次进入（刷新/直达）不移动焦点：避免整页焦点环，且页面本身从头开始阅读 */
  if (firstNavigation) {
    firstNavigation = false
    lastPath = to.path
    return
  }
  if (to.path === lastPath) return
  lastPath = to.path
  if (isEditableFocused()) return
  requestAnimationFrame(() => {
    const main = document.getElementById('main')
    if (main && document.activeElement !== main && !isEditableFocused()) {
      try {
        main.focus({ preventScroll: true })
      } catch {
        /* 浏览器不支持 preventScroll 时忽略 */
      }
    }
  })
})
