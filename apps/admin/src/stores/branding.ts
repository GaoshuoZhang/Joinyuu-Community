import { defineStore } from 'pinia'
import { fetchBranding } from '@/api/systemConfig'
import { applyFavicon, cacheBranding, readCachedBranding, setSiteName, DEFAULT_SITE_NAME } from '@/utils/siteBranding'

/* 站点品牌：后台壳（左上角图标 + 站点名称）与浏览器标签页（图标 + 标题）的数据源。
 * 取自「系统配置 → 站点信息」；品牌接口为公开读取，故登录页与未登录标签页也能显示正确品牌。
 * 读取失败静默回退内置默认品牌（并用上次缓存兜底），不阻断后台使用；
 * 系统配置保存成功后 load(true) 即时刷新，同时刷新标签页图标与标题。
 * 客户端页面内品牌跟随移动端主题（CustomerBrandLogo），标签页图标同样取站点 logo —— 见
 * apps/client-mobile/src/utils/siteBranding.ts。 */

const cached = readCachedBranding()

/* 启动首帧即用上次缓存的 logo 接管标签页图标：否则接口返回前会先闪内置 favicon.svg
 * （站点头像在顶栏由 state 直接渲染，不受影响）。 */
applyFavicon(cached?.siteLogo ?? '')

export const useBrandingStore = defineStore('branding', {
  state: () => ({
    siteName: cached?.siteName?.trim() || DEFAULT_SITE_NAME,
    siteSlogan: cached?.siteSlogan ?? '',
    siteLogo: cached?.siteLogo ?? '',
    loaded: false,
    loading: false,
  }),
  actions: {
    /** 拉取站点信息（已加载过则跳过；force = 保存后刷新）。
     * 未登录也能读到（公开接口），因此登录页与首帧标签页都显示真实站点品牌。 */
    async load(force = false) {
      if ((this.loaded && !force) || this.loading) return
      this.loading = true
      try {
        const branding = await fetchBranding()
        this.apply(branding.siteName, branding.siteSlogan, branding.siteLogo)
        this.loaded = true
      } catch {
        /* 失败保持上次缓存/内置默认品牌（下次进入后台再试），避免后台因品牌接口异常不可用 */
        this.apply(this.siteName, this.siteSlogan, this.siteLogo)
      } finally {
        this.loading = false
      }
    },
    /** 应用品牌：store 状态 + 标签页标题 + 标签页图标 + 本地缓存（供下次启动首帧） */
    apply(siteName: string, siteSlogan: string, siteLogo: string) {
      this.siteName = siteName?.trim() || DEFAULT_SITE_NAME
      this.siteSlogan = siteSlogan ?? ''
      this.siteLogo = siteLogo ?? ''
      setSiteName(this.siteName)
      applyFavicon(this.siteLogo)
      cacheBranding({ siteName: this.siteName, siteSlogan: this.siteSlogan, siteLogo: this.siteLogo })
    },
  },
})
