import { defineStore } from 'pinia'
import { fetchBranding } from '@/api/systemConfig'

/* 站点品牌：后台壳（左上角图标 + 站点名称）与浏览器标签页图标的数据源。
 * 与客户端无关——客户端品牌跟随移动端主题（apps/client-mobile CustomerBrandLogo）。
 * 读取失败静默回退默认品牌，不阻断后台使用；系统配置保存成功后 load(true) 即时刷新。 */

const DEFAULT_SITE_NAME = '聚屿社区'

/** 浏览器标签页图标：写入 <link rel="icon">（缺省由 index.html 的 favicon.svg 兜底） */
function applyFavicon(url: string) {
  const head = document.head
  let link = head.querySelector<HTMLLinkElement>('link[data-site-logo]')
  if (!url) {
    /* 清除自定义图标：恢复 index.html 中的默认 favicon.svg */
    if (link) link.remove()
    return
  }
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    /* data-site-logo 标记本节点由运行时接管，便于清除时精确移除（不误删 index.html 的默认图标） */
    link.dataset.siteLogo = '1'
    head.appendChild(link)
  }
  link.href = url
}

export const useBrandingStore = defineStore('branding', {
  state: () => ({
    siteName: DEFAULT_SITE_NAME,
    siteSlogan: '',
    siteLogo: '',
    loaded: false,
    loading: false,
  }),
  actions: {
    /** 拉取站点信息（已加载过则跳过；force = 保存后刷新） */
    async load(force = false) {
      if ((this.loaded && !force) || this.loading) return
      this.loading = true
      try {
        const branding = await fetchBranding()
        this.siteName = branding.siteName?.trim() || DEFAULT_SITE_NAME
        this.siteSlogan = branding.siteSlogan ?? ''
        this.siteLogo = branding.siteLogo ?? ''
        this.loaded = true
        applyFavicon(this.siteLogo)
      } catch {
        /* 失败保持默认品牌（下次进入后台再试），避免后台因品牌接口异常不可用 */
      } finally {
        this.loading = false
      }
    },
  },
})
