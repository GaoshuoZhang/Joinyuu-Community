import { apiMode, httpGet, httpPost } from './http'
import type { ReservationCreatePayload, Space, SpaceReservation, SpaceReservationDetail, SpaceSlot } from '@/types'

/** GET /api/app/spaces — 可预约空间列表 */
export async function fetchSpaces(): Promise<Space[]> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/spaces')).fetchSpaces()
  return httpGet<Space[]>('/spaces')
}

/** GET /api/app/spaces/:id/availability?date= — 某日时段（待审核/已通过预约 + 活动占用） */
export async function fetchAvailability(spaceId: string, date: string): Promise<SpaceSlot[]> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/spaces')).fetchAvailability(spaceId, date)
  return httpGet<SpaceSlot[]>(`/spaces/${spaceId}/availability?date=${date}`)
}

/** GET /api/app/spaces/:id — 空间详情（设备/预约规则；预约页单条读取） */
export async function fetchSpaceDetail(id: string): Promise<Space> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/spaces')).fetchSpaceDetail(id)
  return httpGet<Space>(`/spaces/${id}`)
}

/** POST /api/app/spaces/reservations — 提交预约（开关校验 + 冲突预检 409；needApproval 进 pending） */
export async function createReservation(payload: ReservationCreatePayload): Promise<{ status: 'pending' | 'approved' }> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/spaces')).createReservation(payload)
  return httpPost<{ status: 'pending' | 'approved' }>('/spaces/reservations', payload)
}

/** GET /api/app/me/reservations — 我的预约 */
export async function fetchMyReservations(): Promise<SpaceReservation[]> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/spaces')).fetchMyReservations()
  return httpGet<SpaceReservation[]>('/me/reservations')
}

/** GET /api/app/me/reservations/:id — 本人的空间预约详情。 */
export async function fetchMyReservation(id: string): Promise<SpaceReservationDetail> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/spaces')).fetchMyReservation(id)
  return httpGet<SpaceReservationDetail>(`/me/reservations/${id}`)
}

/** POST /api/app/spaces/reservations/:id/cancel — 取消预约（pending/approved 可取消） */
export async function cancelReservation(id: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/spaces')).cancelReservation(id)
  await httpPost(`/spaces/reservations/${id}/cancel`)
}
