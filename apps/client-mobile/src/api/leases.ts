import type { MyLease } from '@/types'
import { httpGet } from './http'

/** GET /api/app/me/leases — 当前个人承租及当前负责企业的租约历史。 */
export async function fetchMyLeases(): Promise<MyLease[]> {
  return httpGet<MyLease[]>('/me/leases')
}
