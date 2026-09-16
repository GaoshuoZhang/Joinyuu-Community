import { Toast } from 'tdesign-mobile-vue'

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
  } catch {
    /* 用户取消分享时忽略 */
  }
}
