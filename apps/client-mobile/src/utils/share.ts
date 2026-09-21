import { Toast } from 'tdesign-mobile-vue'

/** 用户主动取消分享（系统分享面板取消 / AbortError），无需提示 */
function isUserCancel(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError'
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /cancel|abort/i.test(message)
}

/** v40：统一分享（系统分享优先，其次复制链接；失败兜底提示）。 */
export async function shareContent(payload: { title: string; text?: string; url?: string }): Promise<void> {
  const url = payload.url ?? window.location.href
  try {
    if (navigator.share) {
      await navigator.share({ title: payload.title, text: payload.text, url })
      return
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url)
      Toast('链接已复制，可粘贴分享')
      return
    }
    Toast(url)
  } catch (error) {
    /* 仅用户取消时静默；其余异常给出失败提示 */
    if (isUserCancel(error)) return
    Toast('分享失败，请手动复制链接')
  }
}
