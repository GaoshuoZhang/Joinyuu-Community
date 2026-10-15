/** Tabs 手滑切换：滑动越过阈值即切换，每次手势只切换一格
 * （TDesign 1.16.2 原生滑动会连续跳项，故自管手势；仅横向、且排除 chips/输入区）。 */
export function useTabSwipe(getValues: () => readonly string[], getActive: () => string, setActive: (value: string) => void) {
  let swipe: { identifier: number; x: number; y: number; index: number; switched: boolean } | null = null

  function cancelSwipe() {
    swipe = null
  }

  function startSwipe(event: TouchEvent) {
    cancelSwipe()
    const target = event.target
    if (event.touches.length !== 1 || !(target instanceof Element)) return
    if (!target.closest('.t-tabs__content') || target.closest('.chips, .service-categories, input, textarea')) return
    const touch = event.touches[0]
    swipe = {
      identifier: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      index: getValues().indexOf(getActive()),
      switched: false,
    }
  }

  function moveSwipe(event: TouchEvent) {
    if (!swipe || swipe.switched) return
    if (event.touches.length !== 1) return cancelSwipe()
    const touch = event.touches[0]
    const dx = touch.clientX - swipe.x
    const dy = touch.clientY - swipe.y
    if (Math.abs(dx) <= Math.abs(dy)) return
    if (event.cancelable) event.preventDefault()
    if (Math.abs(dx) < 40) return
    const next = getValues()[swipe.index + (dx < 0 ? 1 : -1)]
    if (!next) return
    setActive(next)
    swipe.switched = true
  }

  return { startSwipe, moveSwipe, cancelSwipe }
}
