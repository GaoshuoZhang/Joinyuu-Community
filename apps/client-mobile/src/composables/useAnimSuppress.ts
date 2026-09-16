import { getCurrentInstance, onActivated } from 'vue'

/** v43：缓存页再次激活时抑制入场/交错动画重放。
 * 直接在组件根元素上一次性添加 no-replay 类（只增不减），
 * 避免通过 shell 切换类名时让正在离场的页面重放入场动画（表现为「先闪一下再进二级页」）。 */
export function useAnimSuppress() {
  let first = true
  onActivated(() => {
    if (first) {
      first = false
      return
    }
    const el = getCurrentInstance()?.proxy?.$el as HTMLElement | undefined
    el?.classList.add('no-replay')
  })
}
