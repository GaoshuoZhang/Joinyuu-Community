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
    await markNoticeRead(id)
    const item = list.value.find((n) => n.id === id)
    if (item && !item.read) {
      item.read = true
      unread.value = Math.max(0, unread.value - 1)
    }
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

  return { unread, list, refreshUnread, ensureLoaded, refreshAll, read, readAll, reset }
})
