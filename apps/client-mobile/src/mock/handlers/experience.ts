import { experienceByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 经验值流水 handlers（缺口 §7-7；Mock 仅演示社区个体身份维度）。 */

export async function fetchExperience(): Promise<{
  identityLabel: string
  level: number
  levelName: string
  nextLevelExp: number
  records: { id: string; delta: number; balance: number; reason: string; at: string }[]
}> {
  return withLatency(() => {
    const payload = readPayload()
    if (!payload) fail(401, '未登录或登录已过期')
    const data = experienceByUid[payload.sub]
    if (!data) {
      return { identityLabel: '社区个体', level: 0, levelName: '未绑定', nextLevelExp: 0, records: [] }
    }
    return data
  })
}
