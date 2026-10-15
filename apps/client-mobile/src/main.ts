import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useAuthStore } from './stores/auth'
import { patchTabRelationships } from './utils/tabAccessibility'
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

function patchAutocomplete(input: HTMLInputElement) {
  const label = input.closest('.t-form__item-wrap')?.querySelector('.t-form__label')?.textContent?.trim()
    ?? input.parentElement?.closest('.field')?.querySelector('label')?.textContent?.trim()
    ?? ''
  const path = window.location.pathname
  let token = ''
  if (input.type === 'password') {
    token = label.includes('原密码') || (path === '/login' && label.includes('密码')) ? 'current-password' : 'new-password'
  } else if (input.autocomplete === 'username'
    || (/登录|找回密码/.test(document.querySelector('h1')?.textContent ?? '') && /账号|用户名|邮箱/.test(label))) token = 'username'
  else if (input.type === 'tel' || label.includes('手机号')) token = 'tel'
  else if (input.inputMode === 'email' || label.includes('邮箱')) token = 'email'
  if (token && input.autocomplete !== token) input.setAttribute('autocomplete', token)
}

function patchA11yFields(root: ParentNode = document) {
  root.querySelectorAll('input, textarea').forEach((el) => {
    if (!el.id) el.id = `fld-${++a11yFieldSeq}-${el.tagName.toLowerCase()}`
    if (!el.getAttribute('name')) el.setAttribute('name', el.id)
    /* 单选/复选的可访问名称来自 TDesign 兄弟节点的可视文案（原生 input 为空壳） */
    const optionText = el
      .closest('.t-radio, .t-checkbox')
      ?.querySelector('.t-radio__title, .t-checkbox__title')
      ?.textContent?.trim()
    if (optionText && !el.getAttribute('aria-label')) el.setAttribute('aria-label', optionText)
  })
  root.querySelectorAll<HTMLInputElement>('input').forEach(patchAutocomplete)
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
      if (!field.id) field.id = `fld-${++a11yFieldSeq}`
      label.setAttribute('for', field.id)
      if (field.dataset.placeholderLabel) {
        field.removeAttribute('aria-label')
        delete field.dataset.placeholderLabel
      }
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
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((field) => {
    if (field.getAttribute('aria-label') || field.getAttribute('aria-labelledby') || field.labels?.length) return
    const placeholder = field.getAttribute('placeholder')
    if (placeholder) {
      field.setAttribute('aria-label', placeholder)
      field.dataset.placeholderLabel = 'true'
    }
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
function activateOnKey(el: HTMLElement, dispatchClick?: (el: HTMLElement) => void) {
  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (dispatchClick) {
      dispatchClick(el)
      return
    }
    clickTarget(el).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/** CheckTag 的选中态同步到 aria-pressed（库只改 class，无 aria 状态） */
function syncTagPressed(el: HTMLElement) {
  el.setAttribute('aria-pressed', el.classList.contains('t-tag--checked') ? 'true' : 'false')
}

/* v52：界面审查 HIGH-1——TDesign Mobile Vue 1.16.2 的 Rate 星星 / Stepper 加减 /
 * Search 清除键与操作键 / Switch 均渲染为 div+onClick，无 role/tabindex/键盘处理/aria
 * （库源码与 tdesign MCP 确认无相关 props，main.ts 此前的修补清单未覆盖它们）。
 * Rate 与 Switch 没有任何键盘替代路径（评分不可键盘修改、可见性开关纯指针可点），
 * Stepper 与 Search 有原生输入框作键盘替代但控件本身不可达、且无可访问名称。
 * 升级 TDesign 时须复核上述内部类名。 */

/** 库内禁用态类名均以 -disabled 结尾（t-stepper--filled-disabled / t-switch--disabled） */
function isLibDisabled(el: HTMLElement): boolean {
  return Array.from(el.classList).some((cls) => cls.endsWith('-disabled'))
}

/** Switch 可访问名称：优先显式 aria-label，其次取同一行可见标签（.switch-row 的同胞 span） */
function switchAccessibleName(el: HTMLElement): string {
  const explicit = el.getAttribute('aria-label')
  if (explicit) return explicit
  const sibling = el.previousElementSibling?.textContent?.trim()
  if (sibling) return sibling
  return el.parentElement?.textContent?.trim() ?? ''
}

/** Rate 星星选中态同步到 aria-pressed（库只改 --selected/--unselected class） */
function syncRatePressed(el: HTMLElement) {
  el.setAttribute('aria-pressed', el.classList.contains('t-rate__icon--selected') ? 'true' : 'false')
}

/** Switch 开关态同步到 aria-checked（库只改 t-switch--checked class） */
function syncSwitchChecked(el: HTMLElement) {
  el.setAttribute('aria-checked', el.classList.contains('t-switch--checked') ? 'true' : 'false')
}

/** 禁用态同步：不可用时移出 Tab 序列并标 aria-disabled，可用时恢复（类名随值动态变化） */
function syncLibDisabled(el: HTMLElement) {
  if (isLibDisabled(el)) {
    el.setAttribute('aria-disabled', 'true')
    el.removeAttribute('tabindex')
  } else {
    el.removeAttribute('aria-disabled')
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
  }
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
  /* v52：Rate / Stepper / Search / Switch（见上方 sync* 系列注释） */
  for (const el of collect(root, '.t-rate')) {
    /* 评分组：调用方的 aria-label（如「活动评分」）经属性透传落在根 div 上，补 group 角色可被读屏分组播报 */
    if (el.getAttribute('aria-label') && !el.hasAttribute('role')) el.setAttribute('role', 'group')
  }
  for (const el of collect(root, '.t-rate__icon')) {
    if (keyboardPatched.has(el)) continue
    keyboardPatched.add(el)
    const index = Array.prototype.indexOf.call(el.parentElement?.children ?? [], el) + 1
    el.setAttribute('role', 'button')
    el.setAttribute('tabindex', '0')
    el.setAttribute('aria-label', `打 ${index} 分`)
    syncRatePressed(el)
    /* Rate 的点击处理读取 event.pageX 计算命中星号：合成事件必须带上星星中心的页面坐标，
     * 否则任何星号都会命中第 1 分（getRect 对 pageX=0 的计算结果）。
     * pageX 是原型只读 getter 且不在 MouseEventInit 中，构造后以 defineProperty 补值。 */
    activateOnKey(el, (target) => {
      const rect = target.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: centerX })
      Object.defineProperty(event, 'pageX', { value: centerX + (window.scrollX || 0) })
      target.dispatchEvent(event)
    })
  }
  for (const el of collect(root, '.t-stepper__minus, .t-stepper__plus')) {
    if (keyboardPatched.has(el)) continue
    keyboardPatched.add(el)
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', el.classList.contains('t-stepper__minus') ? '减少' : '增加')
    syncLibDisabled(el)
    activateOnKey(el)
  }
  for (const el of collect(root, '.t-search__clear, .t-search__search-action')) {
    if (keyboardPatched.has(el)) continue
    keyboardPatched.add(el)
    el.setAttribute('role', 'button')
    el.setAttribute('tabindex', '0')
    /* 操作键自带可见文案（如「搜索」），可访问名称取内容，无需 aria-label */
    if (!el.getAttribute('aria-label') && !el.textContent?.trim()) {
      el.setAttribute('aria-label', el.classList.contains('t-search__clear') ? '清除搜索内容' : '搜索')
    }
    activateOnKey(el)
  }
  for (const el of collect(root, '.t-switch')) {
    if (keyboardPatched.has(el)) continue
    /* 行级已承载交互的（role=button 祖先，如 NotificationSettingsView 的 Cell）不再补焦点，
     * 避免「按钮内嵌开关」的双重 Tab 停留；名称由行承载 */
    if (el.closest('[role="button"], [role="switch"], a[href], button')) continue
    keyboardPatched.add(el)
    el.setAttribute('role', 'switch')
    const name = switchAccessibleName(el)
    if (name) el.setAttribute('aria-label', name)
    syncSwitchChecked(el)
    syncLibDisabled(el)
    activateOnKey(el)
  }
}

const checkboxStates = new WeakSet<HTMLElement>()
function syncCheckbox(el: HTMLElement) {
  el.setAttribute('role', 'checkbox')
  const disabled = !!el.querySelector('.t-checkbox__title--disabled, .t-checkbox__icon--disabled')
  el.setAttribute('aria-checked', String(el.classList.contains('t-checkbox--checked')))
  el.setAttribute('aria-disabled', String(disabled))
  el.tabIndex = disabled ? -1 : 0
  const label = el.querySelector<HTMLElement>('.t-checkbox__title')?.innerText.trim()
  if (label && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', label)
}

function patchTabs(root: ParentNode = document) {
  const roots = [
    ...(root instanceof HTMLElement && root.matches('.t-tabs') ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('.t-tabs'),
  ]
  for (const tabs of roots) {
    patchTabRelationships(tabs)
  }
  const checkboxes = [
    ...(root instanceof HTMLElement && root.matches('.t-checkbox') ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('.t-checkbox'),
  ]
  for (const checkbox of checkboxes) {
    syncCheckbox(checkbox)
    if (checkboxStates.has(checkbox)) continue
    checkboxStates.add(checkbox)
    checkbox.addEventListener('keydown', (event) => {
      if (event.key !== ' ' || checkbox.getAttribute('aria-disabled') === 'true') return
      event.preventDefault()
      checkbox.click()
    })
  }
}

document.addEventListener('keydown', (event) => {
  const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>('[role="tab"]')
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const tabs = [...(tab.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])]
  const enabled = tabs.filter((item) => item.getAttribute('aria-disabled') !== 'true')
  const current = enabled.indexOf(tab)
  if (current < 0 || !enabled.length) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
    : (current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length
  enabled[next].focus()
  enabled[next].click()
})

/* CheckTag 切换后库只更新 class，需要把新状态同步到 aria-pressed */
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    const target = mutation.target
    if (!(target instanceof HTMLElement)) continue
    if (target.classList.contains('t-tag--checkable')) {
      syncTagPressed(target)
    }
    /* v52：Rate 选中态 / Switch 开关态 / Stepper·Switch 禁用态随 class 变化同步到 aria */
    if (target.classList.contains('t-rate__icon') && keyboardPatched.has(target)) {
      syncRatePressed(target)
    }
    if (target.matches('.t-checkbox')) syncCheckbox(target)
    if (target.classList.contains('t-switch') && keyboardPatched.has(target)) {
      syncSwitchChecked(target)
      syncLibDisabled(target)
    }
    if (target.matches('.t-stepper__minus, .t-stepper__plus') && keyboardPatched.has(target)) {
      syncLibDisabled(target)
    }
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true })

/* 弹层焦点：打开时聚焦首个可聚焦元素、Tab 圈闭、关闭后回焦触发元素。 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
const dialogFocus = new WeakMap<HTMLElement, HTMLElement | null>()
const openDialogs = new WeakSet<HTMLElement>()
function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  return el.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

function focusDialog(dialog: HTMLElement) {
  if (dialog.contains(document.activeElement)) return
  /* v51 起关闭键也可聚焦，但它不参与首次聚焦：弹层打开时应先落到首个表单控件/操作按钮 */
  const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  const first =
    focusables.find((el) => !el.matches('.t-popup__close, .t-dialog__close-btn')) ?? focusables[0]
  if (!first) return
  dialogFocus.set(dialog, document.activeElement instanceof HTMLElement ? document.activeElement : null)
  window.requestAnimationFrame(() => {
    if (!dialog.contains(document.activeElement)) first.focus()
  })
}

function restoreDialogFocus() {
  const dialogs = [...document.querySelectorAll<HTMLElement>('.t-dialog[role="dialog"], .t-popup[role="dialog"]')].filter(isVisible)
  const trigger = dialogs.length ? dialogFocus.get(dialogs[dialogs.length - 1]) : undefined
  if (trigger && (document.activeElement === document.body || !document.activeElement?.isConnected)) trigger.focus()
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return
  const dialogs = [...document.querySelectorAll<HTMLElement>('.t-dialog[role="dialog"], .t-popup[role="dialog"]')].filter(isVisible)
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
    const visible = isVisible(el)
    const wasOpen = openDialogs.has(el)
    if (visible && !wasOpen) {
      openDialogs.add(el)
      dialogFocus.set(el, document.activeElement instanceof HTMLElement ? document.activeElement : null)
      focusDialog(el)
    } else if (!visible && wasOpen) {
      openDialogs.delete(el)
      const trigger = dialogFocus.get(el)
      if (trigger && (document.activeElement === document.body || el.contains(document.activeElement))) trigger.focus()
    }
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
patchTabs(document)
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const added of mutation.addedNodes) {
      if (!(added instanceof HTMLElement)) continue
      patchA11yFields(added)
      patchDecorativeTags(added)
      patchKeyboardTargets(added)
      patchTabs(added)
      announceToast(added)
      announceFieldError(added)
      patchLoadingRoles(added)
      patchDialogRoles(added)
    }
    if (mutation.target instanceof HTMLElement) {
      const tabs = mutation.target.closest<HTMLElement>('.t-tabs')
      if (tabs) patchTabs(tabs)
      const field = mutation.target.closest<HTMLElement>('.field, .t-form__item-wrap')
      if (field) patchA11yFields(field)
    }
    for (const removed of mutation.removedNodes) {
      if (!(removed instanceof HTMLElement)) continue
      handleRemovedDialog(removed)
    }
  }
}).observe(document.body, { childList: true, subtree: true })
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (!(mutation.target instanceof HTMLElement)) continue
    const target = mutation.target
    if (target.matches('.t-tabs__item, .t-tabs__nav, .t-tabs__panel')) patchTabs(target.closest('.t-tabs') ?? target)
    if (target.matches('.t-checkbox__icon, .t-checkbox__title')) {
      const checkbox = target.closest<HTMLElement>('.t-checkbox')
      if (checkbox) syncCheckbox(checkbox)
    }
    if (target.matches('.t-popup, .t-dialog')) patchDialogRoles(target)
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'], subtree: true })
