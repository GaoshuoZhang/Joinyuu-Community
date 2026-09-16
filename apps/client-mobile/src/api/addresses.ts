import { apiMode, httpDelete, httpGet, httpPost, httpPut } from './http'
import type { AddressItem, AddressPayload } from '@/types'
import * as mock from '@/mock/handlers/addresses'

/** R1 我的收货地址（视图沿用单字段 address，HTTP 层兼容后端 region/detail）。 */
export async function listAddresses(): Promise<AddressItem[]> {
  if (apiMode === 'mock') return mock.listAddresses()
  const result = await httpGet<{ list: Array<Omit<AddressItem, 'address'> & { region: string; detail: string }> }>('/me/addresses')
  return result.list.map((item) => ({ ...item, address: `${item.region}${item.detail}` }))
}

/** 新增 / 编辑收货地址。 */
export async function saveAddress(id: string | undefined, payload: AddressPayload): Promise<{ id: string }> {
  if (apiMode === 'mock') return mock.saveAddress(id, payload)
  if (id) return httpPut<{ id: string }>(`/me/addresses/${id}`, payload)
  return httpPost<{ id: string }>('/me/addresses', payload)
}

/** 删除收货地址。 */
export async function removeAddress(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.removeAddress(id)
  await httpDelete(`/me/addresses/${id}`)
}
