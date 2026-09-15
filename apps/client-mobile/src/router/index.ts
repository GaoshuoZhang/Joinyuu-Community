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
        { path: 'events', name: 'events', component: () => import('@/views/mobile/EventsView.vue') },
        { path: 'events/:id', name: 'event-detail', component: () => import('@/views/mobile/EventDetailView.vue') },
        { path: 'events/:id/check-in', name: 'event-checkin', component: () => import('@/views/mobile/CheckInView.vue'), meta: { requiresAuth: true } },

        /* ---- 积分商城 ---- */
        { path: 'mall', name: 'mall', component: () => import('@/views/mobile/MallView.vue') },
        { path: 'mall/:id', name: 'mall-detail', component: () => import('@/views/mobile/MallDetailView.vue'), meta: { requiresAuth: true } },

        /* ---- 空间预约 ---- */
        { path: 'spaces', name: 'spaces', component: () => import('@/views/mobile/SpacesView.vue') },
        { path: 'spaces/:id/reserve', name: 'space-reserve', component: () => import('@/views/mobile/SpaceReserveView.vue'), meta: { requiresAuth: true } },

        /* ---- 内容与企业名片 ---- */
        { path: 'articles', name: 'articles', component: () => import('@/views/mobile/ArticlesView.vue') },
        { path: 'articles/new', name: 'article-new', component: () => import('@/views/mobile/ArticleNewView.vue'), meta: { requiresAuth: true } },
        { path: 'articles/:id', name: 'article-detail', component: () => import('@/views/mobile/ArticleDetailView.vue') },
        { path: 'talents/:uid', name: 'talent-card', component: () => import('@/views/mobile/TalentCardView.vue') },
        /* talent-card: 公开人才名片（人才库点入） */
        { path: 'enterprises/:id', name: 'enterprise-showcase', component: () => import('@/views/mobile/EnterpriseShowcaseView.vue') },
        { path: 'enterprises/:id/showcase-apply', name: 'showcase-apply', component: () => import('@/views/mobile/ShowcaseApplyView.vue'), meta: { requiresAuth: true } },

        /* ---- 站内信 [MOCK-ONLY] ---- */
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
        { path: 'me/reservations', name: 'me-reservations', component: () => import('@/views/mobile/MyReservationsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/articles', name: 'me-articles', component: () => import('@/views/mobile/MyArticlesView.vue'), meta: { requiresAuth: true } },
        { path: 'me/applications', name: 'me-applications', component: () => import('@/views/mobile/MyApplicationsView.vue'), meta: { requiresAuth: true } },
        { path: 'me/projects', name: 'me-projects', component: () => import('@/views/mobile/MyProjectsView.vue'), meta: { requiresAuth: true } },
        { path: 'applications/new', name: 'application-new', component: () => import('@/views/mobile/ApplicationNewView.vue'), meta: { requiresAuth: true } },
        { path: 'applications/settle', name: 'application-settle', component: () => import('@/views/mobile/ApplicationSettleView.vue'), meta: { requiresAuth: true } },
        { path: 'applications/cooperation', name: 'application-cooperation', component: () => import('@/views/mobile/ApplicationCooperationView.vue'), meta: { requiresAuth: true } },
        { path: 'applications/individual', name: 'application-individual', component: () => import('@/views/mobile/ApplicationIndividualView.vue'), meta: { requiresAuth: true } },
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