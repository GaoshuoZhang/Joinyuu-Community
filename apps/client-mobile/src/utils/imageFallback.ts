/** v41：图片加载失败兜底——清除 src 并加类，由全局样式给出占位背景，避免浏览器破图。
 * v44：同时兼容原生 img 的 Event 与 TDesign Image 的 `{ e }` 事件参数。 */
export function onImageError(payload: Event | { e?: Event }): void {
  const event = (payload as { e?: Event })?.e ?? (payload as Event)
  const el = event?.target as HTMLImageElement | null
  if (!el || el.dataset.fallback === '1') return
  el.dataset.fallback = '1'
  el.removeAttribute('src')
  el.classList.add('img-fallback')
}
