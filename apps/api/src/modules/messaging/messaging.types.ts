/* 消息中心类型契约（P0）：渠道 / 模板 / Outbox / 投递日志。
 * 凭据只从环境变量读取（credentialEnv 仅存变量名，不存值），任何对外响应都不含密钥原文。 */

import type { CredentialMode } from '../../common/credentials/credential-store'

export type ChannelKind = 'sms' | 'email' | 'inapp'
export type TemplateCategory = 'security' | 'marketing'
export type { CredentialMode }
export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'dead' | 'skipped'
/** 模板版本状态机：draft → pending → approved/rejected → published；历史发布版本置 archived */
export type TemplateVersionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'published' | 'archived'

export const CHANNEL_KINDS: readonly ChannelKind[] = ['sms', 'email', 'inapp']
export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = ['security', 'marketing']
/** 可静音/可被安静时段拦截的仅营销类；安全类强制送达 */
export const SECURITY_CATEGORY: TemplateCategory = 'security'

export interface ProviderConfigField {
  key: string
  label: string
  required?: boolean
  hint?: string
}

export interface ProviderMeta {
  provider: string
  label: string
  /** 该驱动支持的消息类型 */
  supports: readonly ChannelKind[]
  /** 需在环境变量中提供的凭据变量名（仅校验是否齐备，不回传值） */
  credentialKeys: readonly string[]
  /** 非机密配置字段（管理端表单渲染用） */
  configFields: readonly ProviderConfigField[]
}

/** 供应商目录：管理端下拉、服务层校验与凭据齐备判定共用 */
export const PROVIDER_CATALOG: readonly ProviderMeta[] = [
  {
    provider: 'aliyun_sms',
    label: '阿里云短信',
    supports: ['sms'],
    credentialKeys: ['accessKeyId', 'accessKeySecret'],
    configFields: [
      { key: 'signName', label: '短信签名', required: true },
      { key: 'regionId', label: 'Region', hint: '缺省 cn-hangzhou' },
      { key: 'endpoint', label: 'Endpoint', hint: '缺省 dysmsapi.aliyuncs.com' },
      { key: 'templateMapping', label: '模板映射', required: true, hint: 'JSON：{ 我方模板 code: 阿里云模板 CODE }' },
    ],
  },
  {
    provider: 'tencent_sms',
    label: '腾讯云短信',
    supports: ['sms'],
    credentialKeys: ['secretId', 'secretKey'],
    configFields: [
      { key: 'sdkAppId', label: 'SDKAppID', required: true },
      { key: 'signName', label: '短信签名', required: true },
      { key: 'region', label: 'Region', hint: '缺省 ap-guangzhou' },
      { key: 'templateMapping', label: '模板映射', required: true, hint: 'JSON：{ 我方模板 code: 腾讯模板 ID }' },
    ],
  },
  {
    provider: 'smtp',
    label: 'SMTP 邮件',
    supports: ['email'],
    credentialKeys: ['user', 'password'],
    configFields: [
      { key: 'host', label: 'SMTP 主机', required: true },
      { key: 'port', label: '端口', required: true },
      { key: 'secure', label: '启用 TLS', hint: 'true = 465/SSL' },
      { key: 'from', label: '发件人', required: true, hint: '如 聚屿社区 <no-reply@example.com>' },
      { key: 'domainVerified', label: '发件域名已验证', hint: 'true/false，仅作运营提示' },
    ],
  },
  { provider: 'inapp', label: '站内信', supports: ['inapp'], credentialKeys: [], configFields: [] },
  {
    provider: 'dry_run',
    label: '干跑（不入真实通道，开发/测试用）',
    supports: ['sms', 'email', 'inapp'],
    credentialKeys: [],
    configFields: [],
  },
]

export function providerMeta(provider: string): ProviderMeta | undefined {
  return PROVIDER_CATALOG.find((item) => item.provider === provider)
}

/** 渠道对外视图：不含凭据原文，只给齐备状态与脱敏值 */
export interface ChannelView {
  id: string
  kind: ChannelKind
  provider: string
  providerLabel: string
  name: string
  enabled: boolean
  config: Record<string, unknown>
  /** 凭据来源：inline=后台直接填写（只写/脱敏）；env=登记环境变量名 */
  credentialMode: CredentialMode
  /** env 模式下的变量名映射；inline 模式恒为空（不回传密钥） */
  credentialEnv: Record<string, string>
  /** 脱敏视图：inline 已配置 → 掩码；env → 变量名 */
  credentialMasked: Record<string, string>
  /** 凭据环境变量是否齐备 */
  credentialConfigured: boolean
  /** 缺失的环境变量名（便于运维排查） */
  missingCredentials: string[]
  dailyLimit: number
  remark: string | null
  updatedAt: string
  updatedBy: string
}

/** 发送消息入参（驱动只负责投递，不渲染） */
export interface SendMessageInput {
  recipient: string
  subject?: string
  body: string
  templateCode: string
  variables: Record<string, string>
  config: Record<string, unknown>
  credentials: Record<string, string>
}

export interface SendMessageResult {
  providerMessageId?: string
}
