import type { AddressItem, AddressPayload } from '@/types'
import { addressesByUid, nextMockId } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] v38 收货地址簿（实物兑换使用）；接入期接 /api/app/me/addresses。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '请先登录')
  return payload.sub
}

export async function listAddresses(): Promise<AddressItem[]> {
  return withLatency(() => {
    const uid = readPayload()?.sub
    if (!uid) return []
    return [...(addressesByUid[uid] ?? [])]
  }, 120)
}

export async function saveAddress(id: string | undefined, payload: AddressPayload): Promise<{ id: string }> {
  return withLatency(() => {
    const uid = requireUid()
    const name = (payload.name ?? '').trim()
    const phone = (payload.phone ?? '').trim()
    const address = (payload.address ?? '').trim()
    if (!name) fail(400, '请输入收货人姓名')
    if (!/^1\d{10}$/.test(phone)) fail(400, '请输入正确的联系电话')
    if (address.length < 5) fail(400, '请输入详细收货地址')
    const list = (addressesByUid[uid] ??= [])
    const isDefault = payload.isDefault === true || list.length === 0
    if (isDefault) for (const item of list) item.isDefault = false
    if (id) {
      const target = list.find((item) => item.id === id)
      if (!target) fail(404, '地址不存在')
      Object.assign(target, { name, phone, address, isDefault })
      return { id }
    }
    const newId = nextMockId('AD')
    list.push({ id: newId, name, phone, address, isDefault })
    return { id: newId }
  }, 160)
}

export async function removeAddress(id: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const list = (addressesByUid[uid] ??= [])
    const index = list.findIndex((item) => item.id === id)
    if (index < 0) fail(404, '地址不存在')
    const [removed] = list.splice(index, 1)
    if (removed.isDefault && list.length) list[0].isDefault = true
  }, 140)
}
