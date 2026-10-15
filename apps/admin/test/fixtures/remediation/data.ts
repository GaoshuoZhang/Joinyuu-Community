import { reactive, shallowRef } from 'vue'
import { hasPermission } from '../../../src/constants/permissions'
import { PROVIDER_CATALOG } from '../../../../api/src/modules/messaging/messaging.types'

// Test-only permissions never reach the real auth store or any business endpoint.
export const fixtureAuth = reactive({
  name: '隔离验证', permissions: ['*'], dataScope: [] as string[],
  hasPerm(code: string | string[]): boolean { return hasPermission(this.permissions, code) },
  async logout() {},
})

export const captured = shallowRef<unknown>(null)
export const optionStatus = shallowRef('租赁方选项尚未请求')
let release: () => void
const optionsReady = new Promise<void>((resolve) => { release = resolve })
export const releaseOptions = () => release()
export const project = {
  id: 'P-test', name: '隔离验证项目', code: 'P-test', status: 'running', progress: 0,
  startDate: '', endDate: '', initiatedAt: '2026-10-15', description: '', memberCount: 0, expReward: 100,
  demanderId: 'E-test', demanderName: '历史需求方', demanderIdentity: { type: 'community_enterprise', enterpriseId: 'E-test', enterpriseName: '历史需求方' },
  contactName: '测试联系人', contactPhone: '10000000000', creatorName: '隔离验证',
  undertakers: [
    { type: 'custom', id: '', name: '甲测试主体', share: 60, contactName: '甲联系人', phone: '10000000001' },
    { type: 'custom', id: '', name: '乙测试主体', share: 40, contactName: '乙联系人', phone: '10000000002' },
  ],
  milestones: [{ name: '项目立项', date: '2026-10-15', status: 'todo', owners: [] }, { name: '预期交付', date: '2026-11-15', status: 'todo', owners: [] }],
}
export const lease = {
  id: 'LS-test', enterpriseId: 'E-test', enterpriseName: '测试租赁方', renterType: 'enterprise',
  workstationIds: ['WS-test'], startDate: '2026-10-15', endDate: '2027-10-15', longTerm: false,
  monthlyRent: 800, rentPeriod: 'month', contactName: '原联系人', contactPhone: '10000000000', note: '',
}
const config = {
  siteName: '聚屿社区 · 隔离验证', siteSlogan: '仅用于界面验证', mobileUrl: 'localhost:7759',
  registrationOpen: true, mallOpen: true, demandOpen: true, reservationOpen: true, realnameRequired: false,
  homeCarouselOpen: true, leaseExpireRemindDays: 15, uploadMaxSizeMb: 10, passwordExpireEnabled: false,
  passwordExpireDays: 90, realnameVerifyEnabled: false, realnameVerifyProvider: '', realnameVerifyCredentialMode: 'inline',
  realnameVerifyConfig: {}, realnameVerifyCredentialEnv: {}, realnameVerifyProviderLabel: '',
  realnameVerifyCredentialConfigured: false, realnameVerifyMissingCredentials: [], realnameVerifyTestOk: false,
  realnameVerifyTestedAt: null, realnameMode: 'registration', minioEnabled: false, minioEndpoint: '', minioPort: 9000,
  minioUseSsl: false, minioAccessKey: '', minioBucket: 'joinyuu', minioSecretKeyConfigured: false,
  minioSecretKeyMasked: '', minioCredentialSource: 'none', updatedAt: '2026-10-15 10:00', updatedBy: '测试夹具',
}
const fixedChannels: Record<string, unknown>[] = [{ id: 'MC-test', kind: 'sms', provider: 'aliyun_sms', providerLabel: '阿里云短信',
  name: '短信通知', enabled: false, config: { signName: '隔离测试', templateMapping: { verify_code: 'SMS_test' }, endpoint: 'dysmsapi.aliyuncs.com' },
  credentialMode: 'inline', credentialEnv: {}, credentialMasked: { accessKeyId: '已配置', accessKeySecret: '已配置' },
  credentialConfigured: true, missingCredentials: [], dailyLimit: 2000, remark: '', updatedAt: '2026-10-15 10:00', updatedBy: '隔离验证' }]
export async function read(path: string) {
  if (path === '/message-channels/catalog') return { kinds: ['sms', 'email', 'inapp'], providers: PROVIDER_CATALOG }
  if (path === '/message-channels') return structuredClone(fixedChannels)
  if (path === '/message-templates') return []
  if (path.startsWith('/outbox')) return { list: [], total: 0, stats: { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, skipped: 0 } }
  if (path === '/trash/settings') return []
  if (path.startsWith('/trash')) return { list: [], total: 0 }
  if (path === '/system/mobile-themes') return { activeId: null, previousId: null, schemaVersion: 1, packages: [] }
  if (path === '/system/config') return structuredClone(config)
  if (path === '/system/config/realname/catalog') return { options: [], meta: [] }
  if (path === '/system/license') return { status: 'valid', reason: '隔离界面验证，未连接许可证服务', deploymentId: 'fixture-only', license: null, serverTime: '2026-10-15T02:00:00Z' }
  if (path.startsWith('/cards/schema/')) return { editableFields: ['name', 'bio'] }
  if (path.includes('options')) {
    if (path.includes('renter')) {
      optionStatus.value = '租赁方选项等待中'
      await new Promise((resolve) => setTimeout(resolve, 2000))
      optionStatus.value = '租赁方选项已返回'
      return { users: [], enterprises: [] }
    }
    await optionsReady
    return path.includes('undertaker') ? [] : { users: [], enterprises: [] }
  }
  if (path.includes('experience')) return []
  if (path === '/notifications') return []
  throw new Error(`隔离夹具未定义读取：${path}`)
}
export async function write(path: string, payload: unknown) {
  captured.value = { path, payload }
  if (path.startsWith('/message-channels/fixed/')) {
    const data = payload as Record<string, unknown>
    const index = fixedChannels.findIndex(row => row.kind === data.kind)
    const row = { ...data, id: index >= 0 ? fixedChannels[index].id : `MC-${data.kind}`, providerLabel: data.provider,
      credentialEnv: {}, credentialMasked: {}, credentialConfigured: true, missingCredentials: [], updatedAt: '2026-10-15 18:00' }
    if (index >= 0) fixedChannels[index] = row
    else fixedChannels.push(row)
    return { id: row.id }
  }
  return { code: 0, id: 'fixture-only', ...project }
}
