import type { ObjectDirective } from 'vue'

let sequence = 0
const observers = new WeakMap<HTMLElement, MutationObserver>()
const names = new WeakMap<HTMLElement, string | undefined>()
const managedDescriptions = new WeakMap<HTMLElement, string[]>()
const controlSelector = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, [role="combobox"], [role="spinbutton"], [role="switch"], .t-switch, [contenteditable="true"]'
function ensureId(element: HTMLElement, prefix: string) {
  if (!element.id) element.id = `admin-${prefix}-${++sequence}`
  return element.id
}

/** 将 TDesign 外壳的标签、说明、校验状态关联到真正接收焦点的控件。 */
function associate(root: HTMLElement) {
  const item = root.closest<HTMLElement>('.t-form__item')
  const label = item?.querySelector<HTMLLabelElement>('.t-form__label label') ??
    (root.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(root.id)}"]`) : null)
  const ownName = names.get(root) || root.getAttribute('aria-label')
  const controls = [...root.querySelectorAll<HTMLElement>(controlSelector)]
  if (root.matches(controlSelector)) controls.unshift(root)
  const help = [...(item?.querySelectorAll<HTMLElement>('.t-form__help, .t-input__help, .t-input__extra, .t-form__controls-message, .t-form__controls-extra, .t-form__controls-tips') ?? [])]
    .filter(node => node.textContent?.trim()).map(node => ensureId(node, 'help'))
  for (const control of controls) {
    if (ownName) control.setAttribute('aria-label', ownName)
    else if (label?.textContent?.trim()) {
      control.setAttribute('aria-labelledby', ensureId(label, 'label'))
      // 一个复合控件可能同时有 combobox 外壳和 input，原生 label 聚焦实际输入。
      const focusable = controls.find(node => node.matches('input, textarea, button, [contenteditable="true"]')) ?? controls[0]
      if (focusable) label.htmlFor = ensureId(focusable, 'field')
    }
    const previous = managedDescriptions.get(control) ?? []
    const existing = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && !previous.includes(id))
    const described = [...new Set([...existing, ...help])]
    if (described.length) control.setAttribute('aria-describedby', described.join(' '))
    else control.removeAttribute('aria-describedby')
    managedDescriptions.set(control, help)
    if (item) control.setAttribute('aria-invalid', String(item.classList.contains('t-is-error') || !!item.querySelector('.t-is-error')))
  }
}

export const accessibleField: ObjectDirective<HTMLElement, string | undefined> = {
  mounted(root, binding) {
    names.set(root, binding.value)
    associate(root)
    const observer = new MutationObserver(() => associate(root))
    // 只监听组件负责的结构和 class；避免监听本指令写入的 ARIA/id 引起循环。
    observer.observe(root.closest('.t-form__item') ?? root, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'],
    })
    observers.set(root, observer)
  },
  updated(root, binding) {
    names.set(root, binding.value)
    associate(root)
  },
  beforeUnmount(root) {
    observers.get(root)?.disconnect()
    observers.delete(root)
    names.delete(root)
  },
}
