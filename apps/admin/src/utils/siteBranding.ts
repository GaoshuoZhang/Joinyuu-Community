/* 站点品牌运行时应用（后台壳）：浏览器标签页图标 + 标签页标题。
 *
 * 标签页图标与客户端共用 packages/shared-web 的实现（唯一 `link[rel=icon]` 的策略见该文件说明）。
 * 标题：站点名称来自「系统配置 → 站点信息」，未登录时用 localStorage 缓存的上次值，
 * 避免登录页/刷新首帧仍显示内置名称。 */

import { applyFavicon as applySharedFavicon } from '@joinyuu/shared-web/favicon'

export const DEFAULT_SITE_NAME = '聚屿社区'
const DEFAULT_ICON = './favicon.svg'
const BRANDING_CACHE_KEY = 'joinyuu_admin_branding'

export interface CachedBranding {
  siteName?: string
  siteSlogan?: string
  siteLogo?: string
}

/** 应用标签页图标：url 为空时回退内置 favicon.svg（产物为相对 base，故用 ./） */
export function applyFavicon(url: string) {
  applySharedFavicon(url, DEFAULT_ICON)
}

/** 读取上次已知品牌（登录页/首帧用；localStorage 不可用时返回 null） */
export function readCachedBranding(): CachedBranding | null {
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY)
    return raw ? (JSON.parse(raw) as CachedBranding) : null
  } catch {
    return null
  }
}

/** 缓存品牌（保存配置或接口返回后写入，供下次启动首帧使用） */
export function cacheBranding(branding: CachedBranding) {
  try {
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding))
  } catch {
    /* 隐私模式：忽略缓存，仅影响首帧 */
  }
}

/* 当前站点名称与当前页面标题：两者任一变化都重算 document.title */
let siteName = readCachedBranding()?.siteName?.trim() || DEFAULT_SITE_NAME
let pageTitle: string | undefined

/** 标签页标题：`{页面} · {站点名称}管理后台`（无页面标题时只显示站点名称 + 管理后台） */
export function adminDocumentTitle(title?: string): string {
  return title ? `${title} · ${siteName}管理后台` : `${siteName}管理后台`
}

/** 站点名称变化（品牌接口返回 / 保存配置后）立即刷新标签页标题 */
export function setSiteName(name: string | null | undefined) {
  siteName = (name ?? '').trim() || DEFAULT_SITE_NAME
  document.title = adminDocumentTitle(pageTitle)
}

/** 路由切换时同步页面标题 */
export function setPageTitle(title: string | undefined) {
  pageTitle = title
  document.title = adminDocumentTitle(pageTitle)
}
