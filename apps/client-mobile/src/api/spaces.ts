import { apiMode, httpGet, httpPost } from './http'
import type { ReservationCreatePayload, Space, SpaceReservation, SpaceSlot } from '@/types'
import * as mock from '@/mock/handlers/spaces'

/** GET /api/app/spaces — 可预约空间列表 */
export async function fetchSpaces(): Promise<Space[]> {
  if (apiMode === 'mock') return mock.fetchSpaces()
  return httpGet<Space[]>('/spaces')
}

/** GET /api/app/spaces/:id/availability?date= — 某日已占用时段（已通过预约 + 活动占用） */
export async function fetchAvailability(spaceId: string, date: string): Promise<SpaceSlot[]> {
  if (apiMode === 'mock') return mock.fetchAvailability(spaceId, date)
  return httpGet<SpaceSlot[]>(`/spaces/${spaceId}/availability?date=${date}`)
}

/** POST /api/app/spaces/reservations — 提交预约（开关校验 + 冲突预检 409；needApproval 进 pending） */
export async function createReservation(payload: ReservationCreatePayload): Promise<{ status: 'pending' | 'approved' }> {
  if (apiMode === 'mock') return mock.createReservation(payload)
  return httpPost<{ status: 'pending' | 'approved' }>('/spaces/reservations', payload)
}

/** GET /api/app/me/reservations — 我的预约 */
export async function fetchMyReservations(): Promise<SpaceReservation[]> {
  if (apiMode === 'mock') return mock.fetchMyReservations()
  return httpGet<SpaceReservation[]>('/me/reservations')
}

/** POST /api/app/spaces/reservations/:id/cancel — 取消预约（pending/approved 可取消） */
export async function cancelReservation(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.cancelReservation(id)
  await httpPost(`/spaces/reservations/${id}/cancel`)
}
