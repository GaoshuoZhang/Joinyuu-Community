/** 账号相关本机缓存（localStorage）：登出/换账号时统一清理，避免共用设备下残留上一账号数据。 */

import { clearReadingHistory } from './readingHistory'

/** 最近搜索键（GlobalSearchView 写入，登出时随会话一并清理） */
export const RECENT_SEARCHES_KEY = 'joinyuu_recent_searches'

/** 清理仅属于当前账号的本机缓存：阅读历史 + 最近搜索（主题等设备级偏好保留） */
export function clearAccountLocalData(): void {
  clearReadingHistory()
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY)
  } catch {
    /* 隐私模式下忽略 */
  }
}