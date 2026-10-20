/* 客户端标签页图标（favicon）：取「系统配置 → 站点信息」的站点 logo（随 GET /api/app/config 下发）。
 * 客户主题包里的 brand logo 仍用于页面内品牌位（顶栏/登录页），不参与标签页图标。
 * 实现与后台共用 packages/shared-web（唯一 `link[rel=icon]` 的策略见该文件说明）。 */

import { applyFavicon as applySharedFavicon } from '@joinyuu/shared-web/favicon'

const DEFAULT_ICON = '/favicon.svg'

/** 应用标签页图标：url 为空时回退内置 /favicon.svg */
export function applyFavicon(url: string | null | undefined) {
  applySharedFavicon(url, DEFAULT_ICON)
}
