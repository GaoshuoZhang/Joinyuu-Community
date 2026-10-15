import { legacySettingsRedirect } from '../../../src/utils/settingsNavigation'
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import AdminLayout from '../../../src/layouts/AdminLayout.vue'
import SystemConfig from '../../../src/views/system/SystemConfigView.vue'
import FixtureView from './view.vue'
import { accessibleField } from '../../../src/directives/accessibleField'
import { installTDesignAccessibility } from '../../../src/utils/tdesignAccessibility'
import 'tdesign-vue-next/es/style/index.css'
import '../../../src/styles/tokens.css'

const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: FixtureView, meta: { title: '隔离界面验证' } },
  { path: '/system/config', component: SystemConfig, meta: { title: '系统配置', group: '系统管理' } },
  { path: '/system/mobile-themes', redirect: (to) => legacySettingsRedirect('mobile-themes', to.query) },
  { path: '/system/trash', redirect: (to) => legacySettingsRedirect('trash', to.query) },
  { path: '/system/messages', redirect: (to) => legacySettingsRedirect('messages', to.query) },
  { path: '/:pathMatch(.*)*', component: FixtureView, meta: { title: '路由验证', group: '系统管理' } },
] })
const app = createApp({ render: () => h(AdminLayout) })
app.use(createPinia()).use(router)
app.directive('accessible-field', accessibleField)
app.directive('permission', {})
await router.isReady()
app.mount('#app')
installTDesignAccessibility()
