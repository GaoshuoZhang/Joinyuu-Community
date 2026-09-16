/** v41：图片加载失败兜底——清除 src 并加类，由全局样式给出占位背景，避免浏览器破图。 */
export function onImageError(event: Event): void {
  const el = event.target as HTMLImageElement | null
  if (!el || el.dataset.fallback === '1') return
  el.dataset.fallback = '1'
  el.removeAttribute('src')
  el.classList.add('img-fallback')
}
