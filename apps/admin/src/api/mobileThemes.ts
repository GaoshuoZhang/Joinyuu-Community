import { httpDelete, httpGet, httpPost, httpUpload } from './http'

export interface MobileThemePackage {
  id: string
  manifest: { schemaVersion: number; id: string; name: string; version: string; description?: string; layout?: { template?: string } }
  checksum: string
  createdAt: string
  createdBy: string
}
export interface MobileThemeList { activeId: string | null; previousId: string | null; schemaVersion: number; packages: MobileThemePackage[] }
const base = '/system/mobile-themes'
export const fetchMobileThemes = () => httpGet<MobileThemeList>(base)
export function uploadMobileTheme(file: File) {
  const form = new FormData()
  form.append('file', file)
  return httpUpload<{ id: string }>(`${base}/upload`, form)
}
export const activateMobileTheme = (id: string) => httpPost(`${base}/${encodeURIComponent(id)}/activate`)
export const resetMobileTheme = () => httpPost(`${base}/reset`)
export const deleteMobileTheme = (id: string) => httpDelete(`${base}/${encodeURIComponent(id)}`)
export const previewMobileTheme = (id: string) => httpPost<{ token: string; expiresAt: string }>(`${base}/${encodeURIComponent(id)}/preview`)
