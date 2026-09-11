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
    /* 关闭其他：保留工作台与当前路径对应标签（当前为工作台时等价于只留工作台） */
    closeOthers(currentPath: string) {
      const keep = this.tabs.filter((t) => t.path === '/dashboard' || t.path === currentPath)
      if (!keep.some((t) => t.path === '/dashboard')) {
        keep.unshift({ path: '/dashboard', title: '工作台', closable: false })
      }
      this.tabs = keep
    },
    clear() {
      this.tabs = [{ path: '/dashboard', title: '工作台', closable: false }]
    },
  },
})
