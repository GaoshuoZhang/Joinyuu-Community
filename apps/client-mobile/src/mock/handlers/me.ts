import type { PageQuery, PageResult, PointsRecord, UserProfile } from '@/types'
import { accounts, pointsRecordsByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 个人中心 handlers（GET/PUT /me、points-records）。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

function toProfile(uid: string): UserProfile {
  const account = accounts.find((a) => a.uid === uid)
  if (!account) fail(404, '用户不存在')
  return {
    uid: account.uid,
    phone: account.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
    nickname: account.nickname,
    gender: 'unknown',
    points: account.points,
    status: account.status,
    registeredAt: account.registeredAt,
    identities: account.identities,
  }
}

export async function fetchMe(): Promise<UserProfile> {
  return withLatency(() => toProfile(requireUid()))
}

export async function updateMe(payload: Partial<Pick<UserProfile, 'nickname' | 'gender' | 'bio'>>): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const account = accounts.find((a) => a.uid === uid)
    if (!account) fail(404, '用户不存在')
    if (payload.nickname !== undefined) {
      const nickname = payload.nickname.trim()
      if (!nickname) fail(400, '请输入昵称')
      account.nickname = nickname
    }
  })
}

export async function fetchPointsRecords(query: PageQuery): Promise<PageResult<PointsRecord>> {
  return withLatency(() => {
    const uid = requireUid()
    const all = pointsRecordsByUid[uid] ?? []
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10))
    return {
      list: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
    }
  })
}
