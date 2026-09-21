import { apiMode, httpGet, httpPost, httpPut } from './http'
import type {
  EnterpriseExitPayload,
  EnterpriseShowcase,
  EnterpriseTransferRequest,
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

/** GET /api/app/enterprises/:id — 企业公开名片。 */

export async function fetchEnterpriseShowcase(id: string): Promise<EnterpriseShowcase> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).fetchEnterpriseShowcase(id)
  return httpGet<EnterpriseShowcase>(`/enterprises/${id}`)
}

/** GET /api/app/me/cards — 我的个人名片。 */
export async function fetchMyCards(): Promise<MyCards> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).fetchMyCards()
  return httpGet<MyCards>('/me/cards')
}

/** PUT /api/app/me/cards/individual — 保存个人名片（真实后端为提交审核） */
export async function updateIndividualCard(payload: MyIndividualCardPayload): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).updateIndividualCard(payload)
  await httpPut('/me/cards/individual', await editablePayload('individual', payload))
}

/** GET /api/app/me/identities — 我的关联身份（社区个体 + 我关联的社区企业/合作企业） */
export async function fetchMyIdentities(): Promise<MyIdentitySummary[]> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).fetchMyIdentities()
  return httpGet<MyIdentitySummary[]>('/me/identities')
}

/** GET /api/app/me/enterprises/:id — 企业详情（关联人可查看；负责人可编辑） */
export async function fetchEnterpriseDetail(id: string): Promise<MyEnterpriseDetail> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).fetchEnterpriseDetail(id)
  return httpGet<MyEnterpriseDetail>(`/me/enterprises/${id}`)
}

/** PUT /api/app/me/enterprises/:id — 修改企业基本信息（仅企业负责人） */
export async function updateMyEnterprise(id: string, payload: MyEnterprisePayload): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).updateMyEnterprise(id, payload)
  await httpPut(`/me/enterprises/${id}`, await editablePayload('enterprise', payload))
}

export async function fetchCardSchema(type: 'individual' | 'enterprise'): Promise<{ editableFields: string[] }> {
  if (apiMode === 'mock') return { editableFields: type === 'individual'
    ? ['displayName', 'age', 'politicalStatus', 'intro', 'industryExperience', 'skills', 'education', 'work', 'projects', 'honors', 'socials', 'customLinks', 'visibility']
    : ['logo', 'industry', 'size', 'foundedAt', 'website', 'address', 'description', 'services', 'advantages'] }
  return httpGet(`/card-schema/${type}`)
}

async function editablePayload(type: 'individual' | 'enterprise', payload: object) {
  const { editableFields } = await fetchCardSchema(type)
  return Object.fromEntries(Object.entries(payload).filter(([key]) => editableFields.includes(key)))
}

/** POST /api/app/me/enterprises/:id/transfer-contact — 转移企业负责人（后台字段：联系人） */
export async function transferEnterpriseContact(id: string, payload: TransferContactPayload): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).transferEnterpriseContact(id, payload)
  await httpPost(`/me/enterprises/${id}/transfer-contact`, payload)
}

/** POST /api/app/me/enterprises/:id/invite — 邀请企业成员（生成邀请记录并给被邀请人发站内信） */
export async function inviteEnterpriseMember(id: string, payload: InviteMemberPayload): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).inviteEnterpriseMember(id, payload)
  await httpPost(`/me/enterprises/${id}/invite`, payload)
}

/** PUT /api/app/me/enterprises/:id/member — 修改企业成员信息：职位与手机号（仅企业负责人） */
export async function updateEnterpriseMember(id: string, payload: UpdateMemberPayload): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).updateEnterpriseMember(id, payload)
  await httpPut(`/me/enterprises/${id}/member`, payload)
}

/** GET /api/app/invitations/:id — 企业邀请详情（被邀请人确认入口） */
export async function fetchInvitation(id: string): Promise<InvitationDetail> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).fetchInvitation(id)
  return httpGet<InvitationDetail>(`/invitations/${id}`)
}

/** POST /api/app/invitations/:id/respond — 被邀请人确认加入 / 拒绝邀请 */
export async function respondInvitation(id: string, action: InvitationAction): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).respondInvitation(id, action)
  await httpPost(`/invitations/${id}/respond`, { action })
}

/** 撤销待接受的企业邀请（需邀请权限）。 */
export async function revokeEnterpriseInvitation(invitationId: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).revokeEnterpriseInvitation(invitationId)
  await httpPost(`/me/enterprises/invitations/${invitationId}/revoke`)
}

/** 我收到的负责人转移请求（需目标成员接受后生效）。 */
export async function fetchMyTransferRequests(): Promise<EnterpriseTransferRequest[]> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).fetchMyTransferRequests()
  return httpGet<EnterpriseTransferRequest[]>('/me/transfer-requests')
}

/** 被邀请人接受/拒绝负责人转移。 */
export async function respondEnterpriseTransfer(requestId: string, action: 'accept' | 'reject'): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).respondEnterpriseTransfer(requestId, action)
  await httpPost(`/me/transfer-requests/${requestId}/respond`, { action })
}

/** 发起方撤销待确认的负责人转移请求。 */
export async function cancelEnterpriseTransfer(requestId: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).cancelEnterpriseTransfer(requestId)
  await httpPost(`/me/transfer-requests/${requestId}/cancel`)
}

/** POST /api/app/me/enterprises/:id/remove-member — 移除企业成员（仅企业负责人，不可移除负责人本人） */
export async function removeEnterpriseMember(id: string, payload: RemoveMemberPayload): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).removeEnterpriseMember(id, payload)
  await httpPost(`/me/enterprises/${id}/remove-member`, payload)
}

/** POST /api/app/me/enterprises/:id/exit-application — 申请企业退驻/注销 */
export async function applyEnterpriseExit(id: string, payload: EnterpriseExitPayload): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/enterprises')).applyEnterpriseExit(id, payload)
  await httpPost(`/me/enterprises/${id}/exit-application`, payload)
}
