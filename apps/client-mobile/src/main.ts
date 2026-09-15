import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { apiMode } from './api/http'
import { useAuthStore } from './stores/auth'
import './styles/tokens.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

/* 401 统一处理（api/http.ts 派发）：清会话并由路由层跳登录（history 模式 + redirect 回跳） */
window.addEventListener('joinyuu:unauthorized', (event) => {
  const auth = useAuthStore()
  auth.clearSession()
  if (router.currentRoute.value.path !== '/login') {
    const redirect = (event as CustomEvent<{ redirect?: string }>).detail?.redirect
    router.replace({ path: '/login', query: redirect ? { redirect } : {} })
  }
})

/* a11y 修补：TDesign 表单组件的内层 input/textarea 不携带 id/name、label 也未关联，
 * 统一补齐（Chrome DevTools 会报 form-field issues，补齐后控制台保持干净）。
 * id 使用全局递增序号，避免按当前索引命名时与既有元素撞号。 */
let a11yFieldSeq = 0
function patchA11yFields() {
  document.querySelectorAll('input, textarea').forEach((el) => {
    if (!el.id) el.id = `fld-${++a11yFieldSeq}-${el.tagName.toLowerCase()}`
    if (!el.getAttribute('name')) el.setAttribute('name', el.id)
  })
  document.querySelectorAll('label:not([for])').forEach((label) => {
    const field = label.parentElement?.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="file"]), textarea')
    if (field) label.setAttribute('for', field.id)
  })
}
patchA11yFields()
new MutationObserver(patchA11yFields).observe(document.body, { childList: true, subtree: true })

/* [MOCK-ONLY] 模式标识：仅 mock 模式挂载开发者工具（http 模式此日志不出现） */
if (apiMode === 'mock') {
  console.info('[joinyuu-client] API 模式 = mock（演示数据；切换真实接口见 docs/m2-client-plan.md §3.2）')
}
