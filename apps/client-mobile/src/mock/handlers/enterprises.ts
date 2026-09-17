import type {
  EnterpriseExitPayload,
  EnterpriseMemberPermission,
  EnterpriseRecord,
  EnterpriseShowcase,
  EnterpriseTransferRequest,
  IdentityType,
  InvitationAction,
  InvitationDetail,
  InviteMemberPayload,
  MyCards,
  MyEnterpriseDetail,
  MyEnterprisePayload,
  MyIdentitySummary,
  MyIndividualCardPayload,
  RemoveMemberPayload,
  TransferContactPayload,
  UpdateMemberPayload,
} from '@/types'
import { enterpriseResponsesByEnterprise } from '@/mock/db'
import { ENTERPRISE_PERMISSION_KEYS } from '@/constants/enterprise'
import {
  accounts,
  enterpriseExitApplications,
  enterpriseInvitations,
  enterpriseTransferRequests,
  enterprises,
  individualShowcases,
  nextInvitationId,
  nextMockId,
  nowStamp,
  pushNotice,
  talentMembers,
} from '@/mock/db'
import type { IndividualShowcase } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'
import { formatMockStamp, mockNowMs } from '@/mock/runtime'

/** 邀请 / 转移请求有效期：7 天（按 Mock 业务时钟） */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function expiryAfter7Days(): string {
  return formatMockStamp(mockNowMs() + INVITE_TTL_MS)
}

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false
  return expiresAt < formatMockStamp()
}

/* [MOCK-ONLY] 企业 handlers：公开企业名片、个人名片、关联身份（社区个体 + 关联企业明细与操作）。 */

/** v42 企业工作台：企业名义响应记录 */
export async function fetchEnterpriseWorkbench(id: string): Promise<import('@/types').EnterpriseWorkbench> {
  const list = enterpriseResponsesByEnterprise[id] ?? []
  return { responseCount: list.length, recentResponses: list.map((r) => ({ ...r })) }
}

export async function fetchEnterpriseShowcase(id: string): Promise<EnterpriseShowcase> {
  return withLatency(() => {
    const e = enterprises.find((x) => x.id === id)
    if (!e || e.showcaseStatus !== 'published') fail(404, '企业名片不存在或未发布')
    return {
      id: e.id, name: e.name, logo: e.logo, industry: e.industry, size: e.size,
      foundedAt: e.foundedAt, website: e.website, address: e.address, services: e.services, advantages: e.advantages,
      description: e.description, showcaseStatus: e.showcaseStatus,
      members: e.members.map((m) => m.name),
    }
  })
}

/* ---------- 个人名片（[MOCK-ONLY]，缺口 §7.1-16） ---------- */

function requireAccount() {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  const account = accounts.find((a) => a.uid === payload.sub)
  if (!account) fail(404, '用户不存在')
  return account
}

/** 账号与企业的关联：企业成员 uid 命中，或持该企业的社区企业身份 */
function isAssociated(uid: string, identities: { type: string; enterpriseId?: string }[], enterpriseId: string): boolean {
  const e = enterprises.find((x) => x.id === enterpriseId)
  if (!e) return false
  return e.members.some((m) => m.uid === uid) || identities.some((i) => i.type === 'community_enterprise' && i.enterpriseId === e.id)
}

/** 我的名片（社区个体 → 个人名片；社区企业 → 企业名片，供个人名片页复用个体部分） */
export async function fetchMyCards(): Promise<MyCards> {
  return withLatency(() => {
    const account = requireAccount()
    const result: MyCards = {}
    const entIdentity = account.identities.find((i) => i.type === 'community_enterprise' && i.enterpriseId)
    const e = entIdentity?.enterpriseId ? enterprises.find((x) => x.id === entIdentity.enterpriseId) : undefined
    if (e) {
      result.enterprise = {
        enterpriseId: e.id, enterpriseName: e.name, industry: e.industry,
        size: e.size, description: e.description, showcaseStatus: e.showcaseStatus,
        isContact: e.contactUid === account.uid,
        contactName: e.contactName,
      }
    }
    const individualIdentity = account.identities.find((i) => i.type === 'community_individual')
    if (individualIdentity) {
      const stored = individualShowcases[account.uid]
      const talent = talentMembers.find((t) => t.uid === account.uid)
      const base: IndividualShowcase = stored ?? {
        displayName: account.nickname,
        intro: talent?.intro ?? account.bio ?? '',
        skills: talent?.skills ?? [],
        education: [],
        work: [],
        projects: [],
        honors: [],
        socials: [],
        customLinks: [],
      }
      result.individual = {
        ...base,
        avatar: account.avatar,
        level: individualIdentity.level,
        levelName: individualIdentity.levelName,
      }
    }
    if (!result.enterprise && !result.individual) fail(403, '当前账号没有可查看的名片')
    return result
  }, 160)
}

/** 保存个人名片（简历式分段；[MOCK-ONLY] 保存即生效，联动社区人才库；真实后端为提交审核） */
export async function updateIndividualCard(payload: MyIndividualCardPayload): Promise<void> {
  await withLatency(() => {
    const account = requireAccount()
    if (!account.identities.some((i) => i.type === 'community_individual')) fail(403, '当前账号没有社区个体身份')
    const displayName = (payload.displayName ?? '').trim()
    const intro = (payload.intro ?? '').trim()
    if (!displayName) fail(400, '请输入姓名')
    if (intro.length < 10) fail(400, '个人简介至少 10 个字')
    const links = [...(payload.socials ?? []), ...(payload.customLinks ?? [])]
    if (links.some((l) => (l.url ?? '').trim() && !/^https?:\/\//.test(l.url.trim()))) {
      fail(400, '链接需以 http(s):// 开头')
    }
    const skills = (payload.skills ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8)
    const text = (v?: string) => (v ?? '').trim() || undefined
    const cleanLinks = (list: { label?: string; url?: string }[] = []) =>
      list
        .map((l) => ({ label: (l.label ?? '').trim(), url: (l.url ?? '').trim() }))
        .filter((l) => l.url || l.label)
    individualShowcases[account.uid] = {
      displayName,
      age: text(payload.age),
      politicalStatus: text(payload.politicalStatus),
      intro,
      industryExperience: text(payload.industryExperience),
      skills,
      education: (payload.education ?? [])
        .filter((e) => (e.school ?? '').trim())
        .map((e) => ({ school: e.school.trim(), major: text(e.major), degree: text(e.degree), period: text(e.period) })),
      work: (payload.work ?? [])
        .filter((w) => (w.company ?? '').trim())
        .map((w) => ({ company: w.company.trim(), title: text(w.title), period: text(w.period), description: text(w.description) })),
      projects: (payload.projects ?? [])
        .filter((p) => (p.name ?? '').trim())
        .map((p) => ({ name: p.name.trim(), role: text(p.role), period: text(p.period), description: text(p.description) })),
      honors: (payload.honors ?? []).filter((h) => (h.name ?? '').trim()).map((h) => ({ name: h.name.trim(), date: text(h.date) })),
      socials: cleanLinks(payload.socials),
      customLinks: cleanLinks(payload.customLinks),
      visibility: {
        age: payload.visibility?.age ?? true,
        politicalStatus: payload.visibility?.politicalStatus ?? true,
      },
    }
    const talent = talentMembers.find((t) => t.uid === account.uid)
    if (talent) {
      talent.name = displayName
      talent.intro = intro
      if (skills.length) talent.skills = skills
    }
    pushNotice(account.uid, {
      type: 'system',
      title: '个人名片已更新',
      content: '你的个人名片已更新，将在社区人才库中展示。',
      link: '/community',
    })
  }, 180)
}

/* ---------- 关联身份（社区个体 + 关联企业，[MOCK-ONLY]，缺口 §7.1-16） ---------- */

/** 我在企业的权限（负责人默认全部；成员为被分配集合） */
export function permissionsOf(e: EnterpriseRecord, uid: string): EnterpriseMemberPermission[] {
  if (e.contactUid === uid) return [...ENTERPRISE_PERMISSION_KEYS]
  return e.members.find((m) => m.uid === uid)?.permissions ?? []
}

/** 企业写操作上下文（关联校验 + 权限集合） */
function writeContext(id: string) {
  const account = requireAccount()
  const e = enterprises.find((x) => x.id === id)
  if (!e) fail(404, '企业不存在')
  if (!isAssociated(account.uid, account.identities, e.id)) fail(403, '你与该企业无关联')
  return { account, enterprise: e, perms: permissionsOf(e, account.uid) }
}

/** 企业写操作权限校验：负责人或持指定权限的成员 */
function requireEnterprisePermission(id: string, perm: EnterpriseMemberPermission) {
  const ctx = writeContext(id)
  if (!ctx.perms.includes(perm)) fail(403, '你没有该操作的权限，请联系企业负责人')
  return ctx
}

/** GET /me/identities — 我的关联身份（社区个体 + 我关联的社区企业/合作企业，可多个） */
export async function fetchMyIdentities(): Promise<MyIdentitySummary[]> {
  return withLatency(() => {
    const account = requireAccount()
    const list: MyIdentitySummary[] = []

    const communityIndividual = account.identities.find((i) => i.type === 'community_individual')
    if (communityIndividual) {
      const level = communityIndividual.level
      list.push({
        key: 'community_individual',
        type: 'community_individual',
        label: '社区个体',
        name: account.nickname,
        subtitle: level ? `Lv.${level} ${communityIndividual.levelName ?? ''}`.trim() : '未绑定等级',
      })
    }

    for (const e of enterprises) {
      if (!isAssociated(account.uid, account.identities, e.id)) continue
      const isContact = e.contactUid === account.uid
      const communityIdentity = account.identities.find((i) => i.type === 'community_enterprise' && i.enterpriseId === e.id)
      const externalIdentity = account.identities.find((i) => i.type === 'external_enterprise' && i.organizationName === e.name)
      const type: IdentityType = !communityIdentity && externalIdentity ? 'external_enterprise' : 'community_enterprise'
      list.push({
        key: e.id,
        type,
        label: type === 'external_enterprise' ? '合作企业' : '社区企业',
        name: e.name,
        subtitle: `${e.industry} · ${e.size}`,
        roleLabel: isContact ? '负责人' : '成员',
        isContact,
        permissions: permissionsOf(e, account.uid),
        enterpriseId: e.id,
        showcaseStatus: e.showcaseStatus,
      })
    }

    /* 无企业记录的合作企业组织：展示为信息卡（无详情入口） */
    for (const i of account.identities) {
      if (i.type !== 'external_enterprise' || !i.organizationName) continue
      if (list.some((x) => x.name === i.organizationName)) continue
      list.push({ key: `external:${i.organizationName}`, type: 'external_enterprise', label: '合作企业', name: i.organizationName })
    }

    return list
  }, 160)
}

/** GET /me/enterprises/:id — 企业详情（关联人均可查看；按权限可编辑） */
export async function fetchEnterpriseDetail(id: string): Promise<MyEnterpriseDetail> {
  return withLatency(() => {
    const account = requireAccount()
    const e = enterprises.find((x) => x.id === id)
    if (!e) fail(404, '企业不存在')
    if (!isAssociated(account.uid, account.identities, e.id)) fail(403, '你与该企业无关联')
    return {
      enterpriseId: e.id,
      enterpriseName: e.name,
      logo: e.logo,
      industry: e.industry,
      size: e.size,
      foundedAt: e.foundedAt,
      website: e.website,
      address: e.address,
      services: e.services,
      advantages: e.advantages,
      description: e.description,
      showcaseStatus: e.showcaseStatus,
      contactUid: e.contactUid,
      contactName: e.contactName,
      members: e.members.map((m) => ({ ...m, isContact: m.uid === e.contactUid })),
      isContact: e.contactUid === account.uid,
      myPermissions: permissionsOf(e, account.uid),
      invitations:
        e.contactUid === account.uid
          ? enterpriseInvitations
              .filter((i) => i.enterpriseId === e.id && i.status === 'pending')
              .map((i) => (isExpired(i.expiresAt) ? { ...i, status: 'expired' as const } : { ...i }))
          : [],
      transferRequest:
        e.contactUid === account.uid
          ? (enterpriseTransferRequests.find((r) => r.enterpriseId === e.id && r.status === 'pending' && !isExpired(r.expiresAt)) ?? null)
          : null,
      exitApplication: enterpriseExitApplications[e.id] ?? null,
    }
  }, 160)
}

/** 仅负责人可写：按企业 id 校验关联 + 负责人身份 */
function requireContactEnterprise(id: string) {
  const account = requireAccount()
  const e = enterprises.find((x) => x.id === id)
  if (!e) fail(404, '企业不存在')
  if (!isAssociated(account.uid, account.identities, e.id)) fail(403, '你与该企业无关联')
  if (e.contactUid !== account.uid) fail(403, '仅企业负责人可操作')
  return { account, enterprise: e }
}

export async function updateMyEnterprise(id: string, payload: MyEnterprisePayload): Promise<void> {
  await withLatency(() => {
    const { account, enterprise: e } = requireEnterprisePermission(id, 'edit_card')
    const industry = (payload.industry ?? '').trim()
    const size = (payload.size ?? '').trim()
    const description = (payload.description ?? '').trim()
    if (!industry) fail(400, '请输入所属行业')
    if (!size) fail(400, '请选择企业规模')
    if (description.length < 10) fail(400, '企业简介至少 10 个字')
    e.industry = industry
    e.size = size
    e.description = description
    e.foundedAt = (payload.foundedAt ?? '').trim() || undefined
    const website = (payload.website ?? '').trim()
    /* v39：官网协议校验（前端会预校验，服务端兜底） */
    if (website && !/^https?:\/\//i.test(website)) fail(400, '企业官网需以 http(s):// 开头')
    e.website = website || undefined
    e.address = (payload.address ?? '').trim() || undefined
    e.services = (payload.services ?? '').trim() || undefined
    e.advantages = (payload.advantages ?? '').trim() || undefined
    if (payload.logo !== undefined) {
      /* [MOCK-ONLY] 上传返回 data URL；接入期存真实对象存储 url */
      e.logo = payload.logo.trim() || undefined
    }
    pushNotice(account.uid, { type: 'system', title: '企业信息已更新', content: `「${e.name}」基本信息已更新。`, link: `/me/enterprises/${e.id}` })
  }, 180)
}

/** 发起负责人转移请求：需目标成员已注册（有 uid），对方接受后生效（v35）。 */
export async function transferEnterpriseContact(id: string, payload: TransferContactPayload): Promise<void> {
  await withLatency(() => {
    const { account, enterprise: e } = requireContactEnterprise(id)
    const target = e.members.find((m) => (payload.memberUid ? m.uid === payload.memberUid : m.name === payload.memberName))
    if (!target) fail(404, '未找到该企业成员')
    if (!target.uid) fail(400, '该成员尚未注册聚屿社区账号，暂无法转移负责人')
    if (target.uid === e.contactUid) fail(409, '该成员已是企业负责人')
    if (enterpriseTransferRequests.some((r) => r.enterpriseId === e.id && r.status === 'pending' && !isExpired(r.expiresAt))) {
      fail(409, '已有待确认的转移请求，请等待对方处理或撤销后重试')
    }
    const request: EnterpriseTransferRequest = {
      id: nextMockId('ET'),
      enterpriseId: e.id,
      enterpriseName: e.name,
      fromUid: account.uid,
      fromName: e.contactName ?? account.nickname,
      toUid: target.uid,
      toName: target.name,
      status: 'pending',
      at: nowStamp(),
      expiresAt: expiryAfter7Days(),
    }
    enterpriseTransferRequests.unshift(request)
    pushNotice(target.uid, { type: 'system', title: '企业负责人转移请求', content: `「${e.name}」的负责人 ${request.fromName} 邀请你接任企业负责人，请前往关联身份确认。`, link: '/me/identities' })
    pushNotice(account.uid, { type: 'system', title: '转移请求已发送', content: `已向 ${target.name} 发送「${e.name}」负责人转移请求，等待对方确认。`, link: `/me/enterprises/${e.id}` })
  }, 200)
}

/** 我收到的待确认负责人转移请求（过期自动过滤）。 */
export async function fetchMyTransferRequests(): Promise<EnterpriseTransferRequest[]> {
  return withLatency(() => {
    const account = requireAccount()
    return enterpriseTransferRequests
      .filter((r) => r.toUid === account.uid && r.status === 'pending')
      .map((r) => (isExpired(r.expiresAt) ? { ...r, status: 'expired' as const } : { ...r }))
      .filter((r) => r.status === 'pending')
  }, 160)
}

/** 被邀请人接受/拒绝负责人转移；接受后负责人变更并通知发起方。 */
export async function respondEnterpriseTransfer(requestId: string, action: 'accept' | 'reject'): Promise<void> {
  await withLatency(() => {
    const account = requireAccount()
    const request = enterpriseTransferRequests.find((r) => r.id === requestId)
    if (!request) fail(404, '转移请求不存在')
    if (request.toUid !== account.uid) fail(403, '仅被邀请人可处理该请求')
    if (request.status !== 'pending') fail(409, '该请求已处理')
    if (isExpired(request.expiresAt)) {
      request.status = 'expired'
      fail(409, '转移请求已过期')
    }
    const e = enterprises.find((x) => x.id === request.enterpriseId)
    if (!e) fail(404, '企业不存在')
    request.status = action === 'accept' ? 'accepted' : 'rejected'
    request.respondedAt = nowStamp()
    if (action === 'accept') {
      e.contactUid = account.uid
      e.contactName = request.toName
    }
    pushNotice(request.fromUid, {
      type: 'system',
      title: action === 'accept' ? '负责人转移已确认' : '负责人转移被拒绝',
      content: action === 'accept' ? `${request.toName} 已接受，成为「${e.name}」的企业负责人。` : `${request.toName} 拒绝了「${e.name}」负责人转移请求。`,
      link: `/me/enterprises/${e.id}`,
    })
  }, 200)
}

/** 发起方撤销待确认的转移请求。 */
export async function cancelEnterpriseTransfer(requestId: string): Promise<void> {
  await withLatency(() => {
    const account = requireAccount()
    const request = enterpriseTransferRequests.find((r) => r.id === requestId)
    if (!request) fail(404, '转移请求不存在')
    if (request.fromUid !== account.uid) fail(403, '仅发起人可撤销该请求')
    if (request.status !== 'pending') fail(409, '该请求已处理')
    request.status = 'revoked'
    request.respondedAt = nowStamp()
    pushNotice(request.toUid, { type: 'system', title: '负责人转移已撤销', content: `「${request.enterpriseName}」的负责人转移请求已撤销。` })
  }, 160)
}

/** 撤销待接受的企业邀请（需邀请权限）。 */
export async function revokeEnterpriseInvitation(invitationId: string): Promise<void> {
  await withLatency(() => {
    const invitation = enterpriseInvitations.find((i) => i.id === invitationId)
    if (!invitation) fail(404, '邀请不存在或已失效')
    const { account, enterprise: e } = requireEnterprisePermission(invitation.enterpriseId, 'invite_member')
    if (invitation.status !== 'pending') fail(409, '该邀请已处理')
    invitation.status = 'revoked'
    invitation.respondedAt = nowStamp()
    const invited = accounts.find((a) => a.phone === invitation.phone)
    if (invited) pushNotice(invited.uid, { type: 'system', title: '企业邀请已撤销', content: `「${e.name}」的成员邀请已被撤销。` })
    pushNotice(account.uid, { type: 'system', title: '邀请已撤销', content: `已撤销对 ${invitation.memberName} 的「${e.name}」成员邀请。`, link: `/me/enterprises/${e.id}` })
  }, 160)
}

/** 邀请企业成员：生成邀请记录 + 给被邀请人发站内信（[MOCK-ONLY] 缺口 §7.1-17；真实后端需短信兜底未注册手机号） */
export async function inviteEnterpriseMember(id: string, payload: InviteMemberPayload): Promise<void> {
  await withLatency(() => {
    const { account, enterprise: e } = requireEnterprisePermission(id, 'invite_member')
    const name = (payload.name ?? '').trim()
    const phone = (payload.phone ?? '').trim()
    const role = (payload.role ?? '').trim()
    if (!name) fail(400, '请输入成员姓名')
    if (!/^1\d{10}$/.test(phone)) fail(400, '请输入正确的手机号')
    if (!role) fail(400, '请输入成员职位')
    if (role.length > 20) fail(400, '职位不能超过 20 个字')
    if (e.members.some((m) => m.phone === phone)) fail(409, '该手机号已是企业成员')
    if (enterpriseInvitations.some((i) => i.enterpriseId === e.id && i.phone === phone && i.status === 'pending')) {
      fail(409, '已邀请该手机号，等待对方处理')
    }
    if (account.phone === phone) fail(409, '不能邀请自己')
    const invited = accounts.find((a) => a.phone === phone)
    if (!invited) fail(400, '该手机号尚未注册聚屿社区，暂无法发送邀请')
    const invitation: (typeof enterpriseInvitations)[number] = {
      id: nextInvitationId(),
      enterpriseId: e.id,
      enterpriseName: e.name,
      memberName: name,
      phone,
      role,
      inviterName: account.nickname,
      status: 'pending',
      at: nowStamp(),
      expiresAt: expiryAfter7Days(),
    }
    enterpriseInvitations.unshift(invitation)
    pushNotice(invited.uid, {
      type: 'system',
      title: `企业邀请：${e.name}`,
      content: `「${e.name}」邀请你以「${role}」身份加入，点击查看邀请详情。`,
      link: `/me/invitations/${invitation.id}`,
    })
    pushNotice(account.uid, {
      type: 'system',
      title: '成员邀请已发送',
      content: `已向 ${name}（${role}）发送加入「${e.name}」的邀请，等待对方确认。`,
      link: `/me/enterprises/${e.id}`,
    })
  }, 200)
}

/** GET /invitations/:id — 邀请详情（被邀请人本人或邀请方负责人可查看） */
export async function fetchInvitation(id: string): Promise<InvitationDetail> {
  return withLatency(() => {
    const account = requireAccount()
    const invitation = enterpriseInvitations.find((i) => i.id === id)
    if (!invitation) fail(404, '邀请不存在或已失效')
    const e = enterprises.find((x) => x.id === invitation.enterpriseId)
    if (account.phone !== invitation.phone && e?.contactUid !== account.uid) fail(403, '无权查看该邀请')
    return {
      ...invitation,
      enterpriseLogo: e?.logo,
      enterpriseIndustry: e?.industry ?? '',
      enterpriseSize: e?.size ?? '',
    }
  }, 160)
}

/** POST /invitations/:id/respond — 被邀请人确认加入 / 拒绝（接受后写入企业成员并通知负责人） */
export async function respondInvitation(id: string, action: InvitationAction): Promise<void> {
  await withLatency(() => {
    const account = requireAccount()
    const invitation = enterpriseInvitations.find((i) => i.id === id)
    if (!invitation) fail(404, '邀请不存在或已失效')
    if (account.phone !== invitation.phone) fail(403, '仅被邀请人可处理该邀请')
    if (invitation.status !== 'pending') fail(409, '该邀请已处理')
    if (isExpired(invitation.expiresAt)) {
      invitation.status = 'expired'
      fail(409, '邀请已过期')
    }
    const e = enterprises.find((x) => x.id === invitation.enterpriseId)
    if (!e) fail(404, '企业不存在')
    invitation.status = action === 'accept' ? 'accepted' : 'rejected'
    invitation.respondedAt = nowStamp()
    if (action === 'accept') {
      if (!e.members.some((m) => m.phone === invitation.phone)) {
        e.members.push({ uid: account.uid, name: invitation.memberName, role: invitation.role, phone: invitation.phone })
      }
    }
    if (e.contactUid) {
      pushNotice(e.contactUid, {
        type: 'system',
        title: action === 'accept' ? '成员邀请已确认' : '成员邀请被拒绝',
        content:
          action === 'accept'
            ? `${invitation.memberName} 已接受邀请并加入「${e.name}」（${invitation.role}）。`
            : `${invitation.memberName} 拒绝了加入「${e.name}」的邀请。`,
        link: `/me/enterprises/${e.id}`,
      })
    }
  }, 200)
}

/** 修改企业成员信息：职位 / 手机号（需管理成员权限）与权限（需分配权限） */
export async function updateEnterpriseMember(id: string, payload: UpdateMemberPayload): Promise<void> {
  await withLatency(() => {
    const { account, enterprise: e, perms } = writeContext(id)
    const wantsBase = payload.role !== undefined || payload.phone !== undefined
    const wantsPerm = payload.permissions !== undefined
    if (!wantsBase && !wantsPerm) fail(400, '没有需要保存的修改')
    if (wantsBase && !perms.includes('manage_members')) fail(403, '你没有管理成员的权限，请联系企业负责人')
    if (wantsPerm && !perms.includes('assign_permission')) fail(403, '你没有分配权限的权限，请联系企业负责人')
    const target = e.members.find((m) => (payload.memberUid ? m.uid === payload.memberUid : m.name === payload.memberName))
    if (!target) fail(404, '未找到该企业成员')
    const isContactTarget = target.uid ? target.uid === e.contactUid : target.name === e.contactName
    const changes: string[] = []
    if (payload.role !== undefined) {
      const role = payload.role.trim()
      if (!role) fail(400, '请输入成员职位')
      if (role.length > 20) fail(400, '职位不能超过 20 个字')
      if (target.role !== role) changes.push(`职位「${role}」`)
      target.role = role
    }
    if (payload.phone !== undefined) {
      const phone = payload.phone.trim()
      if (phone && !/^1\d{10}$/.test(phone)) fail(400, '请输入正确的手机号')
      if (phone && e.members.some((m) => m !== target && m.phone === phone)) fail(409, '该手机号已被其他成员使用')
      if ((target.phone ?? '') !== phone) changes.push(`手机号 ${phone || '（已清空）'}`)
      target.phone = phone || undefined
    }
    if (payload.permissions !== undefined) {
      if (isContactTarget) fail(400, '负责人默认拥有全部权限，无需分配')
      const invalid = payload.permissions.filter((p) => !ENTERPRISE_PERMISSION_KEYS.includes(p))
      if (invalid.length) fail(400, '权限取值不合法')
      target.permissions = [...new Set(payload.permissions)]
      changes.push(`权限（${target.permissions.length} 项）`)
    }
    pushNotice(account.uid, {
      type: 'system',
      title: '成员信息已更新',
      content: `「${e.name}」成员 ${target.name} 的${changes.length ? changes.join('、') : '信息'}已更新。`,
      link: `/me/enterprises/${e.id}`,
    })
  }, 180)
}

/** 移除企业成员（需管理成员权限；负责人本人需先转移负责人） */
export async function removeEnterpriseMember(id: string, payload: RemoveMemberPayload): Promise<void> {
  await withLatency(() => {
    const { account, enterprise: e } = requireEnterprisePermission(id, 'manage_members')
    const index = e.members.findIndex((m) => (payload.memberUid ? m.uid === payload.memberUid : m.name === payload.memberName))
    if (index < 0) fail(404, '未找到该企业成员')
    const target = e.members[index]
    if (target.uid ? target.uid === e.contactUid : target.name === e.contactName) {
      fail(409, '负责人不能被移除，请先转移负责人')
    }
    e.members.splice(index, 1)
    pushNotice(account.uid, {
      type: 'system',
      title: '成员已移除',
      content: `成员 ${target.name} 已从「${e.name}」移除。`,
      link: `/me/enterprises/${e.id}`,
    })
  }, 180)
}

export async function applyEnterpriseExit(id: string, payload: EnterpriseExitPayload): Promise<void> {
  await withLatency(() => {
    const { account, enterprise: e } = requireContactEnterprise(id)
    if (enterpriseExitApplications[e.id]) fail(409, '退驻/注销申请已提交，请等待社区运营处理')
    const reason = (payload.reason ?? '').trim()
    enterpriseExitApplications[e.id] = { status: 'pending', reason: reason || undefined, at: nowStamp() }
    pushNotice(account.uid, {
      type: 'audit_result',
      title: '退驻/注销申请已提交',
      content: `「${e.name}」退驻/注销申请已提交，社区运营将在 3 个工作日内与你联系。`,
      link: `/me/enterprises/${e.id}`,
    })
  }, 200)
}
