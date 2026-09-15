import { apiMode, httpGet, httpPost, httpPut } from './http'
import type {
  EnterpriseExitPayload,
  EnterpriseShowcase,
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
import * as mock from '@/mock/handlers/enterprises'

/** GET /api/app/enterprises/:id — 企业名片（showcaseStatus=published 才可见） */
export async function fetchEnterpriseShowcase(id: string): Promise<EnterpriseShowcase> {
  if (apiMode === 'mock') return mock.fetchEnterpriseShowcase(id)
  return httpGet<EnterpriseShowcase>(`/enterprises/${id}`)
}

/** POST /api/app/showcase-requests — 企业名片发布申请（→ 管理端审核联动 showcaseStatus） */
export async function createShowcaseRequest(enterpriseId: string, note: string): Promise<void> {
  if (apiMode === 'mock') return mock.createShowcaseRequest(enterpriseId, note)
  await httpPost('/showcase-requests', { enterpriseId, note })
}

/** GET /api/app/me/cards — 我的名片（个人名片；缺口 §7.1-16） */
export async function fetchMyCards(): Promise<MyCards> {
  if (apiMode === 'mock') return mock.fetchMyCards()
  return httpGet<MyCards>('/me/cards')
}

/** PUT /api/app/me/cards/individual — 保存个人名片（真实后端为提交审核） */
export async function updateIndividualCard(payload: MyIndividualCardPayload): Promise<void> {
  if (apiMode === 'mock') return mock.updateIndividualCard(payload)
  await httpPut('/me/cards/individual', payload)
}

/** GET /api/app/me/identities — 我的关联身份（社区个体 + 我关联的社区企业/合作企业） */
export async function fetchMyIdentities(): Promise<MyIdentitySummary[]> {
  if (apiMode === 'mock') return mock.fetchMyIdentities()
  return httpGet<MyIdentitySummary[]>('/me/identities')
}

/** GET /api/app/me/enterprises/:id — 企业详情（关联人可查看；负责人可编辑） */
export async function fetchEnterpriseDetail(id: string): Promise<MyEnterpriseDetail> {
  if (apiMode === 'mock') return mock.fetchEnterpriseDetail(id)
  return httpGet<MyEnterpriseDetail>(`/me/enterprises/${id}`)
}

/** PUT /api/app/me/enterprises/:id — 修改企业基本信息（仅企业负责人） */
export async function updateMyEnterprise(id: string, payload: MyEnterprisePayload): Promise<void> {
  if (apiMode === 'mock') return mock.updateMyEnterprise(id, payload)
  await httpPut(`/me/enterprises/${id}`, payload)
}

/** POST /api/app/me/enterprises/:id/transfer-contact — 转移企业负责人（后台字段：联系人） */
export async function transferEnterpriseContact(id: string, payload: TransferContactPayload): Promise<void> {
  if (apiMode === 'mock') return mock.transferEnterpriseContact(id, payload)
  await httpPost(`/me/enterprises/${id}/transfer-contact`, payload)
}

/** POST /api/app/me/enterprises/:id/invite — 邀请企业成员（生成邀请记录并给被邀请人发站内信） */
export async function inviteEnterpriseMember(id: string, payload: InviteMemberPayload): Promise<void> {
  if (apiMode === 'mock') return mock.inviteEnterpriseMember(id, payload)
  await httpPost(`/me/enterprises/${id}/invite`, payload)
}

/** PUT /api/app/me/enterprises/:id/member — 修改企业成员信息：职位与手机号（仅企业负责人） */
export async function updateEnterpriseMember(id: string, payload: UpdateMemberPayload): Promise<void> {
  if (apiMode === 'mock') return mock.updateEnterpriseMember(id, payload)
  await httpPut(`/me/enterprises/${id}/member`, payload)
}

/** GET /api/app/invitations/:id — 企业邀请详情（被邀请人确认入口） */
export async function fetchInvitation(id: string): Promise<InvitationDetail> {
  if (apiMode === 'mock') return mock.fetchInvitation(id)
  return httpGet<InvitationDetail>(`/invitations/${id}`)
}

/** POST /api/app/invitations/:id/respond — 被邀请人确认加入 / 拒绝邀请 */
export async function respondInvitation(id: string, action: InvitationAction): Promise<void> {
  if (apiMode === 'mock') return mock.respondInvitation(id, action)
  await httpPost(`/invitations/${id}/respond`, { action })
}

/** POST /api/app/me/enterprises/:id/remove-member — 移除企业成员（仅企业负责人，不可移除负责人本人） */
export async function removeEnterpriseMember(id: string, payload: RemoveMemberPayload): Promise<void> {
  if (apiMode === 'mock') return mock.removeEnterpriseMember(id, payload)
  await httpPost(`/me/enterprises/${id}/remove-member`, payload)
}

/** POST /api/app/me/enterprises/:id/exit-application — 申请企业退驻/注销 */
export async function applyEnterpriseExit(id: string, payload: EnterpriseExitPayload): Promise<void> {
  if (apiMode === 'mock') return mock.applyEnterpriseExit(id, payload)
  await httpPost(`/me/enterprises/${id}/exit-application`, payload)
}
