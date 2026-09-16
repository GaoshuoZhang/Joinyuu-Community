import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { apiMode } from './api/http'
import { useAuthStore } from './stores/auth'
import { useNoticesStore } from './stores/notices'
import { pressable } from './directives/pressable'
import { announce } from './utils/a11y'
import './styles/tokens.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('pressable', pressable)
app.mount('#app')

/* 401 统一处理（api/http.ts 派发）：清会话并由路由层跳登录（history 模式 + redirect 回跳） */
window.addEventListener('joinyuu:unauthorized', (event) => {
  const auth = useAuthStore()
  auth.clearSession()
  /* v38：同步清理通知状态，避免旧角标/列表带入下一次会话 */
  useNoticesStore().reset()
  if (router.currentRoute.value.path !== '/login') {
    const redirect = (event as CustomEvent<{ redirect?: string }>).detail?.redirect
    router.replace({ path: '/login', query: redirect ? { redirect } : {} })
  }
})

/* a11y 修补（v40：仅扫描新增子树，避免长列表下全文档查询造成输入卡顿）：
 * 1）TDesign 表单组件的内层 input/textarea 不携带 id/name、label 也未关联，统一补齐；
 * 2）Toast 文本播报到 aria-live（屏幕阅读器可感知操作结果）；
 * 3）Dialog/Popup 补 role="dialog" 与 aria-modal。 */
let a11yFieldSeq = 0
function patchA11yFields(root: ParentNode = document) {
  root.querySelectorAll('input, textarea').forEach((el) => {
    if (!el.id) el.id = `fld-${++a11yFieldSeq}-${el.tagName.toLowerCase()}`
    if (!el.getAttribute('name')) el.setAttribute('name', el.id)
  })
  root.querySelectorAll('label:not([for])').forEach((label) => {
    const field = label.parentElement?.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="file"]), textarea')
    if (field) label.setAttribute('for', field.id)
  })
}

function announceToast(node: HTMLElement) {
  const toast = node.matches('.t-toast') ? node : node.querySelector<HTMLElement>('.t-toast')
  const text = toast?.innerText.trim()
  if (text) announce(text)
}

function patchDialogRoles(node: HTMLElement) {
  const dialogs = [
    ...(node.matches('.t-dialog, .t-popup') ? [node] : []),
    ...node.querySelectorAll<HTMLElement>('.t-dialog, .t-popup'),
  ]
  for (const el of dialogs) {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog')
    if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true')
  }
}

patchA11yFields(document)
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const added of mutation.addedNodes) {
      if (!(added instanceof HTMLElement)) continue
      patchA11yFields(added)
      announceToast(added)
      patchDialogRoles(added)
    }
  }
}).observe(document.body, { childList: true, subtree: true })

/* [MOCK-ONLY] 模式标识：仅 mock 模式挂载开发者工具（http 模式此日志不出现） */
if (apiMode === 'mock') {
  console.info('[joinyuu-client] API 模式 = mock（演示数据；切换真实接口见 docs/m2-client-plan.md §3.2）')
}
