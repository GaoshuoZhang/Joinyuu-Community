/** v39：本机阅读历史（localStorage，最多 10 条；仅客户端偏好，不参与 Mock 业务数据）。 */

import { formatLocalDateTime } from './format'

export interface ReadingHistoryItem {
  id: string
  title: string
  at: string
}

const HISTORY_KEY = 'joinyuu_reading_history'
const MAX_ITEMS = 10

export function listReadingHistory(): ReadingHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as ReadingHistoryItem[]) : []
  } catch {
    return []
  }
}

export function addReadingHistory(item: { id: string; title: string }): void {
  try {
    const list = listReadingHistory().filter((entry) => entry.id !== item.id)
    list.unshift({ ...item, at: formatLocalDateTime(new Date()) })
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)))
  } catch {
    /* 隐私模式下忽略 */
  }
}

export function clearReadingHistory(): void {
  localStorage.removeItem(HISTORY_KEY)
}

/** v40：移除单条浏览历史 */
export function removeReadingHistoryItem(id: string): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(listReadingHistory().filter((entry) => entry.id !== id)))
  } catch {
    /* 隐私模式下忽略 */
  }
}
