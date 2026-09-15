import type { PageQuery, PageResult, PointsRecord, RealNameInfo, RealNamePayload, UserProfile } from '@/types'
import { accounts, nowStamp, pointsRecordsByUid, pushNotice } from '@/mock/db'
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
    realName: account.realName,
    realNameVerified: !!(account.realName && account.citizenId),
    avatar: account.avatar,
    gender: account.gender ?? 'unknown',
    bio: account.bio,
    points: account.points,
    status: account.status,
    registeredAt: account.registeredAt,
    identities: account.identities,
  }
}

export async function fetchMe(): Promise<UserProfile> {
  return withLatency(() => toProfile(requireUid()))
}

export async function updateMe(payload: Partial<Pick<UserProfile, 'nickname' | 'gender' | 'bio' | 'avatar'>>): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const account = accounts.find((a) => a.uid === uid)
    if (!account) fail(404, '用户不存在')
    if (payload.nickname !== undefined) {
      const nickname = payload.nickname.trim()
      if (!nickname) fail(400, '请输入昵称')
      if (nickname.length > 20) fail(400, '昵称不能超过 20 个字')
      account.nickname = nickname
    }
    if (payload.avatar !== undefined) {
      /* [MOCK-ONLY] 上传返回 data URL；接入期存真实对象存储 url */
      account.avatar = payload.avatar.trim() || undefined
    }
    if (payload.gender !== undefined) {
      if (!['male', 'female', 'unknown'].includes(payload.gender)) fail(400, '性别取值不合法')
      account.gender = payload.gender
    }
    if (payload.bio !== undefined) {
      const bio = payload.bio.trim()
      if (bio.length > 200) fail(400, '个人简介不能超过 200 字')
      account.bio = bio
    }
  })
}

/* ---------- 实名认证（[MOCK-ONLY] 缺口 §7.1-18；真实后端需三要素/公安库核验） ---------- */

function maskRealName(name: string): string {
  if (name.length <= 1) return name
  return name[0] + '*'.repeat(name.length - 1)
}

function maskCitizenId(id: string): string {
  if (id.length < 8) return id
  return `${id.slice(0, 4)}${'*'.repeat(id.length - 8)}${id.slice(-4)}`
}

/** 身份证号校验（18 位 + 校验码） */
function isValidCitizenId(id: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(id)) return false
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const check = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * weights[i]
  return check[sum % 11] === id[17].toUpperCase()
}

export async function fetchRealName(): Promise<RealNameInfo> {
  return withLatency(() => {
    const account = accounts.find((a) => a.uid === requireUid())
    if (!account) fail(404, '用户不存在')
    if (!account.realName || !account.citizenId) return { verified: false }
    return {
      verified: true,
      realName: maskRealName(account.realName),
      citizenIdMasked: maskCitizenId(account.citizenId),
      verifiedAt: account.realNameVerifiedAt,
    }
  })
}

export async function submitRealName(payload: RealNamePayload): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const account = accounts.find((a) => a.uid === uid)
    if (!account) fail(404, '用户不存在')
    if (account.realName && account.citizenId) fail(409, '已完成实名认证，如需修改请联系社区运营')
    const realName = (payload.realName ?? '').trim()
    const citizenId = (payload.citizenId ?? '').trim()
    if (!realName) fail(400, '请输入真实姓名')
    if (realName.length < 2 || realName.length > 20) fail(400, '真实姓名长度应为 2-20 个字')
    if (!/^[\u4e00-\u9fa5A-Za-z·]{2,20}$/.test(realName)) fail(400, '真实姓名仅支持中文或字母')
    if (!isValidCitizenId(citizenId)) fail(400, '请输入正确的身份证号')
    /* [MOCK-ONLY] 演示全链路：提交即通过（真实后端为三要素核验后回写实名状态） */
    account.realName = realName
    account.citizenId = citizenId.toUpperCase()
    account.realNameVerifiedAt = nowStamp()
    pushNotice(uid, {
      type: 'system',
      title: '实名认证已通过',
      content: `你的实名认证已通过（${maskRealName(realName)}），可享受完整社区服务。`,
      link: '/me/realname',
    })
  }, 220)
}

export async function fetchPointsRecords(query: PageQuery): Promise<PageResult<PointsRecord>> {
  return withLatency(() => {
    const uid = requireUid()
    const kw = query.keyword?.trim() ?? ''
    const all = (pointsRecordsByUid[uid] ?? []).filter((r) => !kw || r.reason.includes(kw) || r.source.includes(kw))
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10))
    return {
      list: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
    }
  })
}
