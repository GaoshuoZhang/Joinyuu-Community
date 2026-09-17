import type { MyStats, PageQuery, PageResult, PointsRecord, RealNameInfo, RealNamePayload, ReportPayload, UserProfile } from '@/types'
import { accountByUid, accountRequestsByUid, accounts, articles, blockedByUid, demands, enrollmentsByUid, nowStamp, ordersByUid, pointsRecordsByUid, pushNotice, reports, responsesByUid } from '@/mock/db'
import { formatMockStamp, parseMockStamp } from '@/mock/runtime'
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

/* [MOCK-ONLY] 实名分级权益：静态两条分级，按当前账号实名状态标注 active（接入期读发布限制配置） */
export async function fetchRealnameRights(): Promise<import('@/types').RealnameRightsGroup[]> {
  return withLatency(() => {
    const account = accounts.find((a) => a.uid === requireUid())
    if (!account) fail(404, '用户不存在')
    const verified = !!(account.realName && account.citizenId)
    const label = (n: number) => (n < 0 ? '不限' : `${n} 次/日`)
    const limits = { demand_publish: verified ? 5 : 1, article_publish: verified ? 3 : 1, event_enroll: verified ? 5 : 3, space_reserve: verified ? 3 : 1 }
    const items = (l: Record<string, number>) => [
      `需求发布：${label(l.demand_publish)}`,
      `文章投稿：${label(l.article_publish)}`,
      `活动报名：${label(l.event_enroll)}`,
      `空间预约：${label(l.space_reserve)}`,
    ]
    return [
      { identityType: 'personal_unverified', level: 0, title: '未实名个人', active: !verified, items: verified ? items({ demand_publish: 1, article_publish: 1, event_enroll: 3, space_reserve: 1 }) : ['当前社区要求先完成实名认证后再操作'], limits: { demand_publish: 1, article_publish: 1, event_enroll: 3, space_reserve: 1 } },
      { identityType: 'personal_verified', level: 0, title: '已实名个人', active: verified, items: items(limits), limits },
    ]
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

/* ---------- v38 账号安全与治理（[MOCK-ONLY]，接入期接 /api/app/me/**） ---------- */

/** 修改登录密码（校验原密码） */
export async function changePassword(payload: { oldPassword: string; password: string }): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const account = accounts.find((a) => a.uid === uid)
    if (!account) fail(404, '账号不存在')
    if (!payload.oldPassword) fail(400, '请输入原密码')
    if (payload.oldPassword !== account.password) fail(400, '原密码不正确')
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(payload.password)) fail(400, '新密码至少 8 位且包含字母与数字')
    account.password = payload.password
  }, 200)
}

/** 提交注销申请（运营复核；冷静期内可撤销由后端实现） */
export async function requestAccountDeletion(reason?: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const requests = (accountRequestsByUid[uid] ??= {})
    if (requests.deletion) fail(409, '注销申请已提交，请等待运营处理')
    /* v41：7 天冷静期，期间可撤回 */
    requests.deletion = { reason: reason?.trim() || undefined, at: nowStamp(), cancelableUntil: formatMockStamp(parseMockStamp(nowStamp()).getTime() + 7 * 86_400_000) }
    pushNotice(uid, { type: 'system', title: '注销申请已受理', content: '社区运营将在 3 个工作日内与你确认，处理期间账号可继续使用。' })
  }, 200)
}

/** 申请导出个人数据（Mock 记录申请；真实后端打包后以站内信/邮箱发送） */
export async function requestDataExport(): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const requests = (accountRequestsByUid[uid] ??= {})
    requests.export = { at: nowStamp() }
    pushNotice(uid, { type: 'system', title: '数据导出申请已提交', content: '数据包将在 3 个工作日内生成，并通过站内信通知下载方式。' })
  }, 160)
}

/** v41 冷静期内撤回注销申请 */
export async function cancelAccountDeletion(): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const requests = accountRequestsByUid[uid]
    if (!requests?.deletion) fail(404, '没有待处理的注销申请')
    delete requests.deletion
    pushNotice(uid, { type: 'system', title: '注销申请已撤回', content: '你的账号将恢复正常使用，感谢留下。' })
  }, 200)
}

export async function fetchMyStats(): Promise<MyStats> {
  return withLatency(() => {
    const uid = requireUid()
    const records = pointsRecordsByUid[uid] ?? []
    return {
      pointsEarned: records.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0),
      pointsSpent: records.filter((r) => r.delta < 0).reduce((s, r) => s + Math.abs(r.delta), 0),
      demands: demands.filter((d) => d.publisherUid === uid).length,
      responses: (responsesByUid[uid] ?? []).length,
      enrollments: (enrollmentsByUid[uid] ?? []).length,
      articles: articles.filter((a) => (a as { authorUid?: string }).authorUid === uid).length,
      projects: 0,
      orders: (ordersByUid[uid] ?? []).length,
    }
  }, 160)
}

/** 我的账号申请状态（注销/导出） */
export async function fetchAccountRequests(): Promise<{ deletion?: { reason?: string; at: string; cancelableUntil?: string }; export?: { at: string } }> {
  return withLatency(() => {
    const uid = requireUid()
    return structuredClone(accountRequestsByUid[uid] ?? {})
  }, 100)
}

/** 我的举报记录（含处理状态） */
export async function listMyReports(): Promise<(ReportPayload & { id: string; at: string; status: 'pending' | 'resolved' | 'rejected' })[]> {
  return withLatency(() => {
    const uid = requireUid()
    return reports.filter((item) => item.uid === uid).map((item) => ({ ...item }))
  }, 120)
}

/** 屏蔽名单（uid + 昵称） */
export async function listBlockedUsers(): Promise<{ uid: string; name: string }[]> {
  return withLatency(() => {
    const uid = requireUid()
    return (blockedByUid[uid] ?? []).map((blockedUid) => ({ uid: blockedUid, name: accountByUid(blockedUid)?.nickname ?? blockedUid }))
  }, 120)
}

export async function blockUser(targetUid: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    if (targetUid === uid) fail(400, '不能屏蔽自己')
    const list = (blockedByUid[uid] ??= [])
    if (!list.includes(targetUid)) list.push(targetUid)
  }, 140)
}

export async function unblockUser(targetUid: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const list = (blockedByUid[uid] ??= [])
    const index = list.indexOf(targetUid)
    if (index >= 0) list.splice(index, 1)
  }, 140)
}
