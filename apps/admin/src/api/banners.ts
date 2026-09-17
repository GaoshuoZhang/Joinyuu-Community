import type { HomeBanner } from '@/types'
import { httpDelete, httpGet, httpPost, httpPut } from './http'

export interface BannerPayload {
  title: string
  subtitle: string
  imageUrl?: string
  link?: string
  sort: number
  enabled: boolean
}

/* GET /api/admin/contents/banners — 轮播图列表（sort 升序） */
export async function fetchBanners(): Promise<HomeBanner[]> {
  return httpGet<HomeBanner[]>('/contents/banners')
}

/* GET /api/admin/contents/banners/settings — 首页轮播图总开关 */
export async function fetchBannerSettings(): Promise<{ carouselOpen: boolean }> {
  return httpGet<{ carouselOpen: boolean }>('/contents/banners/settings')
}

/* PUT /api/admin/contents/banners/settings — 开启/关闭首页轮播图区域 */
export async function saveBannerSettings(carouselOpen: boolean): Promise<{ code: number }> {
  return httpPut<{ code: number }>('/contents/banners/settings', { carouselOpen })
}

/* POST /api/admin/contents/banners — 新增轮播图（BN 前缀发号） */
export async function createBanner(payload: BannerPayload): Promise<HomeBanner> {
  return httpPost<HomeBanner>('/contents/banners', payload)
}

/* PUT /api/admin/contents/banners/:id — 编辑轮播图 */
export async function updateBanner(id: string, payload: BannerPayload): Promise<HomeBanner> {
  return httpPut<HomeBanner>(`/contents/banners/${id}`, payload)
}

/* POST /api/admin/contents/banners/:id/toggle-enabled — 启用/停用单条轮播图 */
export async function toggleBanner(id: string): Promise<HomeBanner> {
  return httpPost<HomeBanner>(`/contents/banners/${id}/toggle-enabled`)
}

/* DELETE /api/admin/contents/banners/:id — 删除轮播图 */
export async function deleteBanner(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/contents/banners/${id}`)
}
