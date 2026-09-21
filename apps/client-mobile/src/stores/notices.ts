import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchNotices, fetchUnreadCount, markAllNoticesRead, markNoticeRead } from '@/api/notices'
import type { UserNotice } from '@/types'

/** 站内信：未读角标 + 列表 + 已读动作。 */
export const useNoticesStore = defineStore('notices', () => {
  const unread = ref(0)
  const list = ref<UserNotice[]>([])
  const total = ref(0)
  const loadingMore = ref(false)
  const pageSize = 20
  let page = 1
  let loadedOnce = false

  async function refreshUnread(): Promise<void> {
    try {
      unread.value = await fetchUnreadCount()
    } catch {
      /* 拉取失败时保留上一次未读值（初始值即 0），避免把角标误清零 */
    }
  }

  async function ensureLoaded(force = false): Promise<void> {
    if (loadedOnce && !force) return
    await refreshAll()
  }

  async function refreshAll(): Promise<void> {
    page = 1
    const result = await fetchNotices(page, pageSize)
    list.value = result.list
    total.value = result.total
    await refreshUnread()
    loadedOnce = true
  }

  async function loadMore(): Promise<void> {
    if (loadingMore.value || list.value.length >= total.value) return
    loadingMore.value = true
    try {
      const nextPage = page + 1
      const result = await fetchNotices(nextPage, pageSize)
      list.value.push(...result.list.filter((item) => !list.value.some((current) => current.id === item.id)))
      total.value = result.total
      page = nextPage
    } finally {
      loadingMore.value = false
    }
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
    total.value = 0
    page = 1
    unread.value = 0
    loadedOnce = false
  }

  /** 以首页聚合等外部来源初始化未读角标（不触发额外请求） */
  function setUnread(value: number): void {
    unread.value = Math.max(0, Math.floor(value))
  }

  return { unread, list, total, loadingMore, refreshUnread, ensureLoaded, refreshAll, loadMore, read, readAll, setUnread, reset }
})
