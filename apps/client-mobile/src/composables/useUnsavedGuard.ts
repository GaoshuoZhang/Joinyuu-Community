import { onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { confirmDialog } from '@/utils/confirmDialog'

/** 表单离开保护：保留原始路由语义，并覆盖刷新、关闭标签页。
 *
 * **redirect 链路去重**：导航被守卫重定向时（例如已登录访问 guestOnly 的 `/login` → 跳首页、
 * 会话失效被 `requiresAuth` 守卫重定向到 `/login`、或跳到 `redirect` 路由），
 * vue-router 会为**新的目标**再跑一次本组件的 `beforeRouteLeave`。若用户已在第一次弹窗中
 * 确认「放弃修改」，第二次不能再问一遍——否则会出现连续两道「离开当前页面？」。
 * 故用户确认后置 `approvedLeave`，整条重定向链路上都直接放行，直到路由真正切换（组件即将卸载）
 * 或导航被别的守卫中止留在本页（此时复位，下次离开仍需提示）。 */
export function useUnsavedGuard(isDirty: () => boolean) {
  let pending = false
  let allowNextLeave = false
  let allowLeaverTimer: number | null = null
  /** 本次离开已被用户确认：重定向链路上不再弹窗 */
  let approvedLeave = false
  const router = useRouter()

  function markClean(): void {
    allowNextLeave = true
    if (allowLeaverTimer !== null) window.clearTimeout(allowLeaverTimer)
    allowLeaverTimer = window.setTimeout(() => {
      allowNextLeave = false
      allowLeaverTimer = null
    }, 0)
  }

  /* 一次导航结束（无论成功、被中止还是重定向完成）即复位「已确认」：
   * 成功离开时组件随即卸载，复位无副作用；导航被别的守卫中止而留在本页时复位，
   * 保证用户停留期间的**下一次**离开仍会正常提示。 */
  const stopAfterEach = router.afterEach(() => {
    approvedLeave = false
  })

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (allowNextLeave || approvedLeave || !isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }

  window.addEventListener('beforeunload', onBeforeUnload)
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    stopAfterEach()
    if (allowLeaverTimer !== null) window.clearTimeout(allowLeaverTimer)
    allowLeaverTimer = null
  })

  onBeforeRouteLeave(() => {
    if (allowNextLeave || approvedLeave || !isDirty()) return true
    if (pending) return false
    pending = true
    return new Promise<boolean>((resolve) => {
      const dialog = confirmDialog({
        title: '离开当前页面？',
        content: '当前修改尚未保存，离开后需要重新填写。',
        cancelBtn: '继续编辑',
        confirmBtn: '放弃修改',
        closeOnOverlayClick: false,
        onCancel: () => {
          pending = false
          dialog.destroy()
          resolve(false)
        },
        onConfirm: () => {
          pending = false
          /* 用户已明确放弃修改：重定向链路（可能还有下一次导航）一律放行，不再重复询问 */
          approvedLeave = true
          dialog.destroy()
          resolve(true)
        },
      })
    })
  })

  return { markClean }
}
