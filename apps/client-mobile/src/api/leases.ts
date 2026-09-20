import type { MyLease } from '@/types'
import * as mock from '@/mock/handlers/leases'
import { apiMode, httpGet } from './http'

/** GET /api/app/me/leases — 当前个人承租及当前负责企业的租约历史。 */
export async function fetchMyLeases(): Promise<MyLease[]> {
  if (apiMode === 'mock') return mock.fetchMyLeases()
  return httpGet<MyLease[]>('/me/leases')
}
