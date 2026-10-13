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
const LABELABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="file"]), textarea, select'

/** 从 label 向上找「只含一个可标注控件」的最近容器：TDesign FormItem 的 label 与控件是
 * 兄弟节点（label 所在层没有 input），需要到 .t-form__item-wrap 才能关联。两类情况即停：
 * 1）容器内出现多个控件（如性别单选组）——歧义，不强行指认；
 * 2）容器内出现第二个 label——已跨出本字段范围（如整张表单）——继续向上会把分组标题
 *    误挂到别的字段（实测表单逐字段挂载时，首个已存在的输入会被错误复用）。 */
function findLabelField(label: HTMLLabelElement): HTMLElement | null {
  let node: HTMLElement | null = label.parentElement
  for (let depth = 0; node && node !== document.body && depth < 6; depth++) {
    const fields = node.querySelectorAll<HTMLElement>(LABELABLE_SELECTOR)
    if (fields.length > 1) return null
    if (node.querySelectorAll('label').length > 1) return null
    if (fields.length === 1) return fields[0]
    node = node.parentElement
  }
  return null
}

function patchA11yFields(root: ParentNode = document) {
  root.querySelectorAll('input, textarea').forEach((el) => {
    if (!el.id) el.id = `fld-${++a11yFieldSeq}-${el.tagName.toLowerCase()}`
    if (!el.getAttribute('name')) el.setAttribute('name', el.id)
    if (el.getAttribute('aria-label')) return
    const placeholder = el.getAttribute('placeholder')
    if (placeholder) {
      el.setAttribute('aria-label', placeholder)
      return
    }
    /* 单选/复选的可访问名称来自 TDesign 兄弟节点的可视文案（原生 input 为空壳） */
    const optionText = el
      .closest('.t-radio, .t-checkbox')
      ?.querySelector('.t-radio__title, .t-checkbox__title')
      ?.textContent?.trim()
    if (optionText) el.setAttribute('aria-label', optionText)
  })
  /* 空 for（TDesign FormItem 会渲染 <label for="">）与无 for 同样视为未关联，
   * 否则 Chrome 会报「label 的 for 不匹配任何 id」，同时影响自动填充与读屏 */
  const labels: HTMLLabelElement[] = [
    ...(root instanceof HTMLLabelElement ? [root] : []),
    ...root.querySelectorAll<HTMLLabelElement>('label'),
  ]
  for (const label of labels) {
    const forAttr = label.getAttribute('for')
    if (forAttr && document.getElementById(forAttr)) continue
    const field = findLabelField(label)
    if (field) {
      label.setAttribute('for', field.id)
      continue
    }
    /* 无法关联表单控件的标签：<label> 语义要求必须关联控件（否则 Chrome 报
     * 「A <label> isn't associated with a form field」）。空占位标签直接移除；
     * 分组标题（性别、栏目等）转为 span 并保留类名/文本，视觉与样式不变。 */
    if (!label.textContent?.trim() && !label.querySelector('input, textarea, select')) {
      label.remove()
      continue
    }
    const span = document.createElement('span')
    for (const attr of Array.from(label.attributes)) {
      if (attr.name !== 'for') span.setAttribute(attr.name, attr.value)
    }
    while (label.firstChild) span.appendChild(label.firstChild)
    label.replaceWith(span)
  }
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

/* v51：TDesign 可交互内部元素的键盘通路与状态语义。
 * 1）CheckTag：库渲染 `<span class="t-tag--checkable" role="button" aria-disabled onClick>`，
 *    无 tabindex、无键盘处理——全站 18 处筛选/选择 chip 纯指针不可达；且切换态只靠
 *    `--primary`/`--default` 底色表达，无 aria 状态（色觉障碍/读屏用户无法得知已选）。
 * 2）Navbar 左侧返回区：库渲染 `<div class="t-navbar__left" onClick>`，无 role/tabindex/名称，
 *    所有二级页的返回既不可键盘操作也无法被读屏识别。
 * 3）Popup / Dialog 关闭键：库渲染 `<div class="t-popup__close" onClick>` 与
 *    `<div class="t-dialog__close-btn">`（后者的关闭处理挂在内部 SVG 图标上），
 *    图标控件既无名称也无键盘通路。
 * 与上面对表单/弹层的修补同源；升级 TDesign 时复核这些内部类名。 */
const keyboardPatched = new WeakSet<HTMLElement>()

/** 真实可点节点：Dialog 的关闭处理挂在内部 SVG 上，点外层 div 不会触发子节点的监听；
 *  其余库内控件把处理挂在外层，点外层（或内部 SVG，会冒泡到外层）均可。 */
function clickTarget(el: HTMLElement): Element {
  return el.querySelector('svg') ?? el
}

/** 补 Enter/Space 激活（派发的 click 会冒泡到库自身的处理） */
function activateOnKey(el: HTMLElement) {
  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    clickTarget(el).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/** CheckTag 的选中态同步到 aria-pressed（库只改 class，无 aria 状态） */
function syncTagPressed(el: HTMLElement) {
  el.setAttribute('aria-pressed', el.classList.contains('t-tag--checked') ? 'true' : 'false')
}

function collect(root: ParentNode, selector: string): HTMLElement[] {
  return [
    ...(root instanceof HTMLElement && root.matches(selector) ? [root] : []),
    ...root.querySelectorAll<HTMLElement>(selector),
  ]
}

function patchKeyboardTargets(root: ParentNode) {
  for (const el of collect(root, '.t-navbar__left')) {
    if (keyboardPatched.has(el)) continue
    /* 仅二级页（有返回箭头）；Tab 页左侧为空，不应成为可聚焦控件 */
    if (!el.querySelector('.t-navbar__left-arrow')) continue
    keyboardPatched.add(el)
    el.setAttribute('role', 'button')
    el.setAttribute('tabindex', '0')
    el.setAttribute('aria-label', '返回')
    activateOnKey(el)
  }
  for (const el of collect(root, '.t-tag--checkable')) {
    if (keyboardPatched.has(el)) continue
    keyboardPatched.add(el)
    /* 禁用项不可聚焦（库用 aria-disabled，不是原生 disabled） */
    if (el.getAttribute('aria-disabled') !== 'true') {
      el.setAttribute('tabindex', '0')
      activateOnKey(el)
    }
    syncTagPressed(el)
  }
  for (const el of collect(root, '.t-popup__close, .t-dialog__close-btn')) {
    if (keyboardPatched.has(el)) continue
    keyboardPatched.add(el)
    el.setAttribute('role', 'button')
    el.setAttribute('tabindex', '0')
    el.setAttribute('aria-label', '关闭')
    activateOnKey(el)
  }
}

/* CheckTag 切换后库只更新 class，需要把新状态同步到 aria-pressed */
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    const target = mutation.target
    if (target instanceof HTMLElement && target.classList.contains('t-tag--checkable')) {
      syncTagPressed(target)
    }
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true })

/* 弹层焦点：打开时聚焦首个可聚焦元素、Tab 圈闭、关闭后回焦触发元素。 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
let lastFocused: HTMLElement | null = null

function focusDialog(dialog: HTMLElement) {
  if (dialog.contains(document.activeElement)) return
  /* v51 起关闭键也可聚焦，但它不参与首次聚焦：弹层打开时应先落到首个表单控件/操作按钮 */
  const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  const first =
    focusables.find((el) => !el.matches('.t-popup__close, .t-dialog__close-btn')) ?? focusables[0]
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
patchKeyboardTargets(document)
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const added of mutation.addedNodes) {
      if (!(added instanceof HTMLElement)) continue
      patchA11yFields(added)
      patchDecorativeTags(added)
      patchKeyboardTargets(added)
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
