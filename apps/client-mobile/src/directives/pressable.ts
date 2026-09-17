import type { Directive } from 'vue'

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  event.preventDefault()
  target.click()
}

/** v38：为 div/article 点击卡片补齐 role/tabindex/键盘激活（不改变既有 @click 逻辑）。
 * 传 `false` 时不增强（用于同一列表中仅部分可点的场景）。 */
export const pressable: Directive<HTMLElement, boolean | undefined> = {
  mounted(el, binding) {
    if (binding.value === false) return
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0
    el.addEventListener('keydown', onKeydown)
  },
  unmounted(el) {
    el.removeEventListener('keydown', onKeydown)
  },
}
