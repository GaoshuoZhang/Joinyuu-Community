import type { MyStats, PageQuery, PageResult, PointsRecord, RealNameInfo, RealNamePayload, RealnameRightsGroup, UserProfile } from '@/types'
import { accountByUid, accountRequestsByUid, accounts, demands, enrollmentsByUid, experienceByUid, myArticlesByUid, nowStamp, ordersByUid, pointsRecordsByUid, projectsByUid, pushNotice, responsesByUid } from '@/mock/db'
import { formatMockStamp, parseMockStamp } from '@/mock/runtime'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'
import { USERNAME_MSG, USERNAME_RESERVED_MSG, isReservedNickname, isReservedUsername, isUsername } from '@/utils/validators'

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
    username: account.username,
    nickname: account.nickname,
    phone: account.phone || undefined,
    email: account.email,
    phoneVerified: Boolean(account.phone && account.phoneVerified),
    emailVerified: Boolean(account.email && account.emailVerified),
    realName: account.realName,
    realNameVerified: !!(account.realName && account.citizenId),
    avatar: account.avatar,
    gender: account.gender ?? 'unknown',
    bio: account.bio,
    points: account.points,
    status: account.status,
    registeredAt: account.registeredAt,
    activationDismissed: account.activationDismissed,
    identities: account.identities,
  }
}

export async function fetchMe(): Promise<UserProfile> {
  return withLatency(() => toProfile(requireUid()))
}

export async function updateMe(payload: Partial<Pick<UserProfile, 'username' | 'nickname' | 'gender' | 'bio' | 'avatar'>>): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const account = accounts.find((a) => a.uid === uid)
    if (!account) fail(404, '用户不存在')
    if (payload.username !== undefined) {
      const username = payload.username.trim().toLowerCase()
      if (!isUsername(username)) fail(400, USERNAME_MSG)
      if (isReservedUsername(username)) fail(400, USERNAME_RESERVED_MSG)
      if (accounts.some((a) => a.username === username && a.uid !== uid)) fail(409, '该用户名已被占用')
      account.username = username
    }
    if (payload.nickname !== undefined) {
      const nickname = payload.nickname.trim()
      if (!nickname) fail(400, '请输入昵称')
      if ([...nickname].length > 20) fail(400, '昵称不能超过 20 个字符')
      if (isReservedNickname(nickname)) fail(400, '该昵称为系统保留，请更换')
      if (accounts.some((a) => a.nickname === nickname && a.uid !== uid)) fail(409, '该昵称已被占用')
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

/** 永久隐藏新手任务（幂等；[MOCK-ONLY] 后端按账号持久化） */
export async function dismissActivation(): Promise<void> {
  await withLatency(() => {
    const account = accounts.find((a) => a.uid === requireUid())
    if (!account) fail(404, '用户不存在')
    account.activationDismissed = true
  }, 120)
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

const RIGHTS_ACTIONS = [
  { key: 'demand_publish', label: '需求发布' },
  { key: 'article_publish', label: '文章投稿' },
  { key: 'event_enroll', label: '活动报名' },
  { key: 'space_reserve', label: '空间预约' },
] as const

/* [MOCK-ONLY] 实名分级权益：按 publishing-limit 规则口径（当前 seed 全部 -1 不限），
 * 输出「个人 + 社区个体 1-5 级 + 社区企业 1-5 级」分组，并按身份/等级标注 active。 */
export async function fetchRealnameRights(): Promise<RealnameRightsGroup[]> {
  return withLatency(() => {
    const account = accounts.find((a) => a.uid === requireUid())
    if (!account) fail(404, '用户不存在')
    const verified = !!(account.realName && account.citizenId)
    const individual = account.identities.find((i) => i.type === 'community_individual')
    /* 默认主体（与后端 resolveSubject 未指定身份时一致）：有社区个体取个体等级，否则取个人实名层级 */
    const subject = individual
      ? { identityType: 'community_individual', level: individual.level ?? 1 }
      : { identityType: verified ? 'personal_verified' : 'personal_unverified', level: 0 }
    const group = (identityType: string, level: number): RealnameRightsGroup => {
      const limits = Object.fromEntries(RIGHTS_ACTIONS.map((action) => [action.key, -1])) as Record<string, number>
      const title = identityType === 'personal_unverified' ? '未实名个人'
        : identityType === 'personal_verified' ? '已实名个人'
          : `${identityType === 'community_individual' ? '社区个体' : '社区企业'} · 等级 ${level}`
      return {
        identityType,
        level,
        title,
        active: identityType === subject.identityType && level === subject.level,
        items: RIGHTS_ACTIONS.map((action) => `${action.label}：不限`),
        limits,
      }
    }
    return [
      group('personal_unverified', 0),
      group('personal_verified', 0),
      ...[1, 2, 3, 4, 5].map((level) => group('community_individual', level)),
      ...[1, 2, 3, 4, 5].map((level) => group('community_enterprise', level)),
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
    account.realName = realName
    account.citizenId = citizenId.toUpperCase()
    account.realNameVerifiedAt = nowStamp()
    pushNotice(uid, {
      type: 'system',
      title: '实名认证已完成',
      content: `你的实名信息已通过规则校验（${maskRealName(realName)}）。`,
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
    const account = accountByUid(uid)
    const individual = account?.identities.find((i) => i.type === 'community_individual')
    return {
      pointsEarned: records.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0),
      pointsSpent: records.filter((r) => r.delta < 0).reduce((s, r) => s + Math.abs(r.delta), 0),
      demands: demands.filter((d) => d.publisherUid === uid).length,
      responses: (responsesByUid[uid] ?? []).length,
      enrollments: (enrollmentsByUid[uid] ?? []).length,
      articles: (myArticlesByUid[uid] ?? []).length,
      projects: (projectsByUid[uid] ?? []).length,
      orders: (ordersByUid[uid] ?? []).length,
      /* v34：个人看板补充经验值/签到/项目 */
      experience: experienceByUid[uid]?.currentExperience ?? individual?.experience ?? 0,
      checkedIn: (enrollmentsByUid[uid] ?? []).filter((item) => item.checkedIn).length,
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
