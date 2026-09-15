import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchNotices, fetchUnreadCount, markAllNoticesRead, markNoticeRead } from '@/api/notices'
import type { UserNotice } from '@/types'

/** 站内信 [MOCK-ONLY]（缺口 §7-1）：未读角标 + 列表 + 已读动作 */
export const useNoticesStore = defineStore('notices', () => {
  const unread = ref(0)
  const list = ref<UserNotice[]>([])
  let loadedOnce = false

  async function refreshUnread(): Promise<void> {
    try {
      unread.value = await fetchUnreadCount()
    } catch {
      unread.value = 0
    }
  }

  async function ensureLoaded(force = false): Promise<void> {
    if (loadedOnce && !force) return
    await refreshAll()
  }

  async function refreshAll(): Promise<void> {
    list.value = await fetchNotices()
    await refreshUnread()
    loadedOnce = true
  }

  async function read(id: string): Promise<void> {
    const item = list.value.find((n) => n.id === id)
    /* 先取未读快照：mock 层与列表共享对象引用，await 后 item.read 已被置真 */
    const wasUnread = !!item && !item.read
    await markNoticeRead(id)
    if (item) item.read = true
    if (wasUnread) unread.value = Math.max(0, unread.value - 1)
  }

  async function readAll(): Promise<void> {
    await markAllNoticesRead()
    list.value = list.value.map((n) => ({ ...n, read: true }))
    unread.value = 0
  }

  function reset(): void {
    list.value = []
    unread.value = 0
    loadedOnce = false
  }

  /** 以首页聚合等外部来源初始化未读角标（不触发额外请求） */
  function setUnread(value: number): void {
    unread.value = Math.max(0, Math.floor(value))
  }

  return { unread, list, refreshUnread, ensureLoaded, refreshAll, read, readAll, setUnread, reset }
})
