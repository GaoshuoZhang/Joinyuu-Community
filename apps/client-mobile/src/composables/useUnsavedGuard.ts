import { onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { confirmDialog } from '@/utils/confirmDialog'

/** 表单离开保护：保留原始路由语义，并覆盖刷新、关闭标签页。 */
export function useUnsavedGuard(isDirty: () => boolean) {
  let pending = false
  let allowNextLeave = false
  let allowLeaverTimer: number | null = null

  function markClean(): void {
    allowNextLeave = true
    if (allowLeaverTimer !== null) window.clearTimeout(allowLeaverTimer)
    allowLeaverTimer = window.setTimeout(() => {
      allowNextLeave = false
      allowLeaverTimer = null
    }, 0)
  }

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (allowNextLeave || !isDirty()) return
    event.preventDefault()
    event.returnValue = ''
  }

  window.addEventListener('beforeunload', onBeforeUnload)
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    if (allowLeaverTimer !== null) window.clearTimeout(allowLeaverTimer)
    allowLeaverTimer = null
  })

  onBeforeRouteLeave(() => {
    if (allowNextLeave || !isDirty()) return true
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
          dialog.destroy()
          resolve(true)
        },
      })
    })
  })

  return { markClean }
}
