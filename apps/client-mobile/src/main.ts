import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useAuthStore } from './stores/auth'
import { pressable } from './directives/pressable'
import { announce } from './utils/a11y'
import { initTheme } from './utils/theme'
import './styles/tokens.css'

initTheme()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('pressable', pressable)
app.mount('#app')

/* 401 统一处理（api/http.ts 派发）：清会话并由路由层跳登录（history 模式 + redirect 回跳） */
window.addEventListener('joinyuu:unauthorized', (event) => {
  const auth = useAuthStore()
  /* v38：resetSession 统一清理登录态与通知缓存，避免旧角标/列表带入下一次会话 */
  auth.resetSession()
  if (router.currentRoute.value.path !== '/login') {
    const redirect = (event as CustomEvent<{ redirect?: string }>).detail?.redirect
    router.replace({ path: '/login', query: redirect ? { redirect } : {} })
  }
})

/* a11y 修补（v40：仅扫描新增子树，避免长列表下全文档查询造成输入卡顿）：
 * 1）TDesign 表单组件的内层 input/textarea 不携带 id/name、label 也未关联，统一补齐；
 * 2）无显式 aria-label 的输入用 placeholder 兜底；
 * 3）Toast / 行内表单错误播报到 aria-live（去重，避免同一文案播报两次）；
 * 4）Dialog/Popup 补 role="dialog" 与 aria-modal。 */
let a11yFieldSeq = 0
function patchA11yFields(root: ParentNode = document) {
  root.querySelectorAll('input, textarea').forEach((el) => {
    if (!el.id) el.id = `fld-${++a11yFieldSeq}-${el.tagName.toLowerCase()}`
    if (!el.getAttribute('name')) el.setAttribute('name', el.id)
    if (!el.getAttribute('aria-label') && el.getAttribute('placeholder')) {
      el.setAttribute('aria-label', el.getAttribute('placeholder') as string)
    }
  })
  root.querySelectorAll('label:not([for])').forEach((label) => {
    const field = label.parentElement?.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="file"]), textarea')
    if (field) label.setAttribute('for', field.id)
  })
}

let lastAnnounced = { text: '', at: 0 }
function announceOnce(text: string) {
  const now = Date.now()
  if (text === lastAnnounced.text && now - lastAnnounced.at < 1500) return
  lastAnnounced = { text, at: now }
  announce(text)
}

function announceToast(node: HTMLElement) {
  const toast = node.matches('.t-toast') ? node : node.querySelector<HTMLElement>('.t-toast')
  const text = toast?.innerText.trim()
  if (text) announceOnce(text)
}

let errorFocusScheduled = false
function isEditableControl(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/* 行内校验错误出现时把焦点移到首个错误字段（用户正在输入时不打断）。
 * 同一帧可能出现多个错误节点，合并为一次、且只聚焦文档中第一个错误。 */
function scheduleErrorFocus() {
  if (errorFocusScheduled) return
  errorFocusScheduled = true
  window.requestAnimationFrame(() => {
    errorFocusScheduled = false
    const field = document.querySelector<HTMLElement>('.field-error, .error')
    if (!field || !field.innerText.trim()) return
    if (isEditableControl(document.activeElement)) return
    const container = field.closest('.field, .agreement, .form') ?? field.parentElement
    const control = container?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([type="file"]), textarea',
    )
    if (!control || (control as HTMLInputElement).disabled) return
    control.focus({ preventScroll: true })
    control.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

function announceFieldError(node: HTMLElement) {
  const fields = [
    ...(node.matches('.field-error, .error') ? [node] : []),
    ...node.querySelectorAll<HTMLElement>('.field-error, .error'),
  ]
  const text = fields.map((el) => el.innerText.trim()).find(Boolean)
  if (text) {
    announceOnce(text)
    scheduleErrorFocus()
  }
}

/* 加载态播报：TDesign Loading 无 status 语义，统一补 role="status"/aria-busy。 */
function patchLoadingRoles(node: HTMLElement) {
  const loadings = [
    ...(node.matches('.t-loading') ? [node] : []),
    ...node.querySelectorAll<HTMLElement>('.t-loading'),
  ]
  for (const el of loadings) {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'status')
    if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite')
    if (!el.hasAttribute('aria-busy')) el.setAttribute('aria-busy', 'true')
    if (!el.hasAttribute('aria-label')) {
      const text = el.innerText.trim()
      if (text) el.setAttribute('aria-label', text)
    }
  }
}

/* 装饰性标签语义（v45）：TDesign Tag 无论是否可点都会输出 role="button" + aria-disabled="false"
 * （见 Tag 组件 API，无「非交互」开关），而本项目 52 处 <Tag> 全是纯展示的分类/状态标签，
 * 读屏会把它们逐条读成「按钮」，让整套控件的可信度下降。
 * 只对非 CheckTag（不带 .t-tag--checkable，实测为该库可交互标签的唯一标记）剥离错误的按钮语义，
 * 不触碰组件 API、样式与任何交互行为。 */
function patchDecorativeTags(root: ParentNode) {
  const tags = Array.from(root.querySelectorAll<HTMLElement>('.t-tag:not(.t-tag--checkable)'))
  for (const el of tags) {
    if (el.getAttribute('role') === 'button') el.removeAttribute('role')
    if (el.hasAttribute('aria-disabled')) el.removeAttribute('aria-disabled')
  }
}

/* 弹层焦点：打开时聚焦首个可聚焦元素、Tab 圈闭、关闭后回焦触发元素。 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
let lastFocused: HTMLElement | null = null

function focusDialog(dialog: HTMLElement) {
  if (dialog.contains(document.activeElement)) return
  const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
  if (!first) return
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  window.requestAnimationFrame(() => {
    if (!dialog.contains(document.activeElement)) first.focus()
  })
}

function restoreDialogFocus() {
  if (lastFocused && document.activeElement === document.body) lastFocused.focus()
  lastFocused = null
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return
  const dialogs = document.querySelectorAll<HTMLElement>('.t-dialog[role="dialog"], .t-popup[role="dialog"]')
  const dialog = dialogs[dialogs.length - 1]
  if (!dialog) return
  const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null,
  )
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (!dialog.contains(document.activeElement)) {
    event.preventDefault()
    first.focus()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
})

function patchDialogRoles(node: HTMLElement) {
  const dialogs = [
    ...(node.matches('.t-dialog, .t-popup') ? [node] : []),
    ...node.querySelectorAll<HTMLElement>('.t-dialog, .t-popup'),
  ]
  for (const el of dialogs) {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog')
    if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true')
    focusDialog(el)
  }
}

function handleRemovedDialog(node: HTMLElement) {
  if (node.matches('.t-dialog, .t-popup') || node.querySelector('.t-dialog, .t-popup')) {
    restoreDialogFocus()
  }
}

patchA11yFields(document)
patchDecorativeTags(document)
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const added of mutation.addedNodes) {
      if (!(added instanceof HTMLElement)) continue
      patchA11yFields(added)
      patchDecorativeTags(added)
      announceToast(added)
      announceFieldError(added)
      patchLoadingRoles(added)
      patchDialogRoles(added)
    }
    for (const removed of mutation.removedNodes) {
      if (!(removed instanceof HTMLElement)) continue
      handleRemovedDialog(removed)
    }
  }
}).observe(document.body, { childList: true, subtree: true })
