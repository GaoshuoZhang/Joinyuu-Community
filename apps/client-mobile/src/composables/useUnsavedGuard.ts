import { ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { DialogPlugin } from 'tdesign-mobile-vue'

/** v38 离开保护：表单有未保存修改时，路由离开前二次确认。
 * v41 修复：由「返回」触发的离开在确认后必须走 router.back()，若一律 router.push(to.fullPath)
 * 会向历史栈追加一条记录，形成「返回上一页 → 再返回又回到本页」的死循环。
 * 用法：`const { markClean } = useUnsavedGuard(() => dirty.value)`，保存成功后调用 `markClean()`。 */
export function useUnsavedGuard(isDirty: () => boolean) {
  const router = useRouter()
  const bypass = ref(false)
  let pending = false
  /* 记录进入本页时的历史位置：返回（popstate）时 history.state 已切换为目标页状态，
   * 无法用 state.back 判断方向，改为比较 position（目标位置 < 源位置 即为返回）。 */
  const sourcePosition = (window.history.state as { position?: number } | null)?.position ?? null

  function markClean(): void {
    bypass.value = true
  }

  onBeforeRouteLeave((to) => {
    if (bypass.value || !isDirty()) return true
    /* 已有确认弹窗时忽略重复触发，避免弹层叠加 */
    if (pending) return false
    pending = true
    const currentPosition = (window.history.state as { position?: number } | null)?.position ?? null
    const isBackNavigation = sourcePosition !== null && currentPosition !== null && currentPosition < sourcePosition
    const dialog = DialogPlugin.confirm({
      title: '离开当前页面？',
      content: '当前修改尚未保存，离开后可能需要重新填写。',
      cancelBtn: '继续编辑',
      confirmBtn: '放弃修改',
      onCancel: () => {
        pending = false
      },
      onConfirm: () => {
        pending = false
        bypass.value = true
        dialog.destroy()
        if (isBackNavigation) router.back()
        else void router.push(to.fullPath)
      },
    })
    return false
  })

  return { markClean }
}
