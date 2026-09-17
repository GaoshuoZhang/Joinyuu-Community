import { httpGet, httpPost, httpPut } from './http'

export type PolicyKind = 'community' | 'agreement_user' | 'agreement_privacy'
export type PolicyStatus = 'published' | 'archived'

export interface PolicyAttachment {
  name: string
  url: string
}

export interface PolicyRecord {
  id: string
  kind: PolicyKind
  category: string
  title: string
  summary: string
  content: string
  version: string
  effectiveAt?: string | null
  attachments: PolicyAttachment[]
  featured: boolean
  status: PolicyStatus
  publishedAt: string
  updatedAt: string
  publisher: string
}

export interface CommunityPolicyPayload {
  category: string
  title: string
  summary: string
  content: string
  version: string
  effectiveAt?: string | null
  attachments: PolicyAttachment[]
  featured: boolean
  status: PolicyStatus
}

export interface AgreementPolicyPayload extends Omit<CommunityPolicyPayload, 'category' | 'attachments' | 'featured'> {
  kind: 'agreement_user' | 'agreement_privacy'
}

export function fetchCommunityPolicies() {
  return httpGet<PolicyRecord[]>('/contents/policies')
}

export function createCommunityPolicy(payload: CommunityPolicyPayload) {
  return httpPost<PolicyRecord>('/contents/policies', payload)
}

export function updateCommunityPolicy(id: string, payload: CommunityPolicyPayload) {
  return httpPut<{ code: number }>(`/contents/policies/${id}`, payload)
}

export function fetchAgreementPolicies() {
  return httpGet<PolicyRecord[]>('/system/policies')
}

export function createAgreementPolicy(payload: AgreementPolicyPayload) {
  return httpPost<PolicyRecord>('/system/policies', payload)
}

export function updateAgreementPolicy(id: string, payload: AgreementPolicyPayload) {
  return httpPut<{ code: number }>(`/system/policies/${id}`, payload)
}
