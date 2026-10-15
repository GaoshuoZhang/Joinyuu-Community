import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSmsTemplateMapping, fixedChannelOfKind } from '../src/utils/notificationSettings.ts'
import { legacySettingsRedirect } from '../src/utils/settingsNavigation.ts'

test('SMS field rows preserve multiple template IDs without JSON and reject ambiguous mappings', () => {
  assert.deepEqual(buildSmsTemplateMapping([{ code: ' verify_code ', templateId: ' SMS_123 ' }, { code: 'event', templateId: '456' }]), { verify_code: 'SMS_123', event: '456' })
  assert.throws(() => buildSmsTemplateMapping([{ code: 'verify_code', templateId: '' }]), /完整填写/)
  assert.throws(() => buildSmsTemplateMapping([{ code: '', templateId: '' }]), /至少/)
  assert.throws(() => buildSmsTemplateMapping([{ code: 'x', templateId: '1' }, { code: ' x ', templateId: '2' }]), /重复/)
  assert.equal(Object.getOwnPropertyDescriptor(buildSmsTemplateMapping([{ code: '__proto__', templateId: '123' }]), '__proto__').value, '123')
})
test('legacy settings URLs retain deep links and isolate archive and delivery filters', () => {
  assert.deepEqual(legacySettingsRedirect('messages', { tab: 'outbox', page: '3', status: 'failed' }), {
    path: '/system/config', query: { tab: 'notifications', messageTab: 'outbox', outboxpage: '3', outboxstatus: 'failed' },
  })
  assert.deepEqual(legacySettingsRedirect('trash', { activeDomain: 'project', keyword: '计划', page: '2' }), {
    path: '/system/config', query: { tab: 'archive', archiveactiveDomain: 'project', archivekeyword: '计划', archivepage: '2' },
  })
  assert.deepEqual(legacySettingsRedirect('mobile-themes', {}), { path: '/system/config', query: { tab: 'themes' } })
})

test('a disabled fixed channel retains the most recently saved provider', () => {
  const old = { kind: 'sms', enabled: false, updatedAt: '2026-10-01', provider: 'aliyun_sms' }
  const current = { kind: 'sms', enabled: false, updatedAt: '2026-10-15', provider: 'tencent_sms' }
  assert.equal(fixedChannelOfKind([old, current], 'sms'), current)
  assert.equal(fixedChannelOfKind([{ ...old, enabled: true }, current], 'sms').provider, 'aliyun_sms')
  assert.equal(fixedChannelOfKind([old, current], 'email'), undefined)
})
