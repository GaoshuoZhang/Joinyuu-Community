/** v38：屏幕阅读器播报（aria-live 区域按需创建）。 */
export function announce(message: string): void {
  if (!message) return
  let el = document.getElementById('a11y-live')
  if (!el) {
    el = document.createElement('div')
    el.id = 'a11y-live'
    el.className = 'sr-only'
    el.setAttribute('aria-live', 'polite')
    el.setAttribute('role', 'status')
    document.body.appendChild(el)
  }
  el.textContent = message
}
