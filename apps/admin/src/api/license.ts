import { httpGet, httpPost } from './http'

export interface LicenseInfo {
  status: 'valid' | 'expired' | 'invalid'
  reason: string
  productId: string
  deploymentId: string
  importedAt: string | null
  serverTime: string
  license: {
    licenseId: string
    customerId: string
    customerName: string
    issuedAt: string
    notBefore: string
    expiresAt: string | null
  } | null
}
export const fetchLicense = () => httpGet<LicenseInfo>('/system/license')
export const requestLicense = (customerName: string) => httpPost<{ deploymentId: string }>('/system/license/request', { customerName })
export const importLicense = (content: string) => httpPost<LicenseInfo>('/system/license/import', { content })
