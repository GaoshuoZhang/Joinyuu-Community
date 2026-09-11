import type { Directive } from 'vue'
import { useAuthStore } from '@/stores/auth'

/* v-permission="'/users'"：无权限时隐藏元素。
 * 用 display:none（而非删除 DOM）：权限变化时 updated 可重新判定并恢复，
 * 避免手工删 DOM 与 Vue patch 失步。 */
function apply(el: HTMLElement, code: string | undefined) {
  if (!code) return
  const auth = useAuthStore()
  el.style.display = auth.hasPerm(code) ? '' : 'none'
}

export const permission: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    apply(el, binding.value)
  },
  updated(el, binding) {
    apply(el, binding.value)
  },
}
