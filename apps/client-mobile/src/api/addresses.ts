import { apiMode, httpDelete, httpGet, httpPost, httpPut } from './http'
import type { AddressItem, AddressPayload } from '@/types'
import * as mock from '@/mock/handlers/addresses'

/** [MOCK-ONLY] v38 我的收货地址。 */
export async function listAddresses(): Promise<AddressItem[]> {
  if (apiMode === 'mock') return mock.listAddresses()
  return httpGet<AddressItem[]>('/me/addresses')
}

/** [MOCK-ONLY] 新增 / 编辑收货地址。 */
export async function saveAddress(id: string | undefined, payload: AddressPayload): Promise<{ id: string }> {
  if (apiMode === 'mock') return mock.saveAddress(id, payload)
  if (id) return httpPut<{ id: string }>(`/me/addresses/${id}`, payload)
  return httpPost<{ id: string }>('/me/addresses', payload)
}

/** [MOCK-ONLY] 删除收货地址。 */
export async function removeAddress(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.removeAddress(id)
  await httpDelete(`/me/addresses/${id}`)
}
