import type { Directive } from 'vue'

const enhanced = new WeakMap<HTMLElement, { role: string | null; tabindex: string | null }>()
function onKeydown(event: KeyboardEvent): void {
  if (event.target !== event.currentTarget || event.repeat || !['Enter', ' '].includes(event.key)) return
  const target = event.currentTarget as HTMLElement
  if (target.getAttribute('aria-disabled') === 'true') return
  event.preventDefault()
  target.click()
}
function cleanup(el: HTMLElement) {
  const original = enhanced.get(el)
  if (!original) return
  for (const name of ['role', 'tabindex'] as const) {
    if (original[name] === null) el.removeAttribute(name)
    else el.setAttribute(name, original[name])
  }
  el.removeEventListener('keydown', onKeydown)
  enhanced.delete(el)
}
function sync(el: HTMLElement, enabled: boolean | undefined) {
  if (enabled === false) return cleanup(el)
  if (enhanced.has(el) || el.matches('button, a[href], input, select, textarea')) return
  enhanced.set(el, { role: el.getAttribute('role'), tabindex: el.getAttribute('tabindex') })
  if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0
  el.addEventListener('keydown', onKeydown)
}
/** 动态启用与停用时同步键盘能力；仅清理由此指令添加的语义。 */
export const pressable: Directive<HTMLElement, boolean | undefined> = {
  mounted: (el, binding) => sync(el, binding.value),
  updated: (el, binding) => sync(el, binding.value),
  unmounted: cleanup,
}
