import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** 窗口是否已滚动到顶部。
 *
 * PullDownRefresh 的 isReachTop 通过向上查找「第一个 overflow-y 可滚动祖先」判断是否处于顶部：
 * 首页的横向滚动容器（overflow-x: auto → overflow-y 计算为 auto）与行内省略/截断元素
 * （overflow: hidden 且 scrollHeight > clientHeight，如两行截断标题）scrollTop 恒为 0，
 * 会被误判为「已到顶」，导致列表下滑后再上滑时被下拉刷新拦截、回弹。
 * 以窗口真实滚动位置为准，离顶时禁用下拉刷新即可规避该误判。 */
export function useAtTop(threshold = 0): Ref<boolean> {
  const atTop = ref(true)
  let raf = 0

  function update() {
    raf = 0
    const top = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
    atTop.value = top <= threshold
  }

  function onScroll() {
    if (raf) return
    raf = window.requestAnimationFrame(update)
  }

  onMounted(() => {
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    if (raf) window.cancelAnimationFrame(raf)
  })

  return atTop
}
