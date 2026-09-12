import type { MyProject } from '@/types'
import { projectsByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 项目协作 handlers（只读：本人承接 + 企业承接）。 */

export async function fetchMyProjects(): Promise<MyProject[]> {
  return withLatency(() => {
    const payload = readPayload()
    if (!payload) return []
    return [...(projectsByUid[payload.sub] ?? [])]
  }, 180)
}
