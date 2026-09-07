import { defineStore } from 'pinia'

export interface TabItem {
  path: string
  title: string
  closable: boolean
}

/* 多标签页状态：AdminLayout 顶栏 tab 条的唯一数据源 */
export const useTabsStore = defineStore('tabs', {
  state: () => ({
    tabs: [{ path: '/dashboard', title: '工作台', closable: false }] as TabItem[],
  }),
  actions: {
    add(tab: TabItem) {
      const item: TabItem = { ...tab, closable: tab.path !== '/dashboard' }
      if (!this.tabs.some((t) => t.path === item.path)) this.tabs.push(item)
    },
    /* 关闭标签，返回应跳转的相邻标签路径（供 Layout 导航） */
    remove(path: string): string | null {
      const index = this.tabs.findIndex((t) => t.path === path)
      if (index < 0) return null
      this.tabs.splice(index, 1)
      if (this.tabs.length === 0) return '/dashboard'
      const next = this.tabs[Math.min(index, this.tabs.length - 1)]
      return next.path
    },
    clear() {
      this.tabs = [{ path: '/dashboard', title: '工作台', closable: false }]
    },
  },
})
