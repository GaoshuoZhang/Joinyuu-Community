<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { MessagePlugin } from 'tdesign-vue-next'
import { buildSmsTemplateMapping, fixedChannelOfKind } from '@/utils/notificationSettings'
import ListErrorState from '@/components/ListErrorState.vue'
import StatusTag from '@/components/StatusTag.vue'
import {
  fetchMessageChannelCatalog,
  fetchMessageChannels,
  saveFixedMessageChannel,
  testSendMessageChannel,
} from '@/api/messageChannels'
import { fetchMessageTemplates } from '@/api/messageTemplates'
import type {
  MessageChannel,
  MessageChannelKind,
  MessageProviderMeta,
  MessageTemplate,
} from '@/types'

/* 通知渠道配置：短信、邮箱、站内信各一个固定设置；
 * 非机密配置在后台直接维护，凭据支持「直接填写密钥」与「登记环境变量名」。
 * 短信模板以字段行维护；地区、端点等可选参数集中在高级设置。 */
const loading = ref(true)
const narrowViewport = window.matchMedia('(max-width: 767px)')
const detailsColumns = ref(narrowViewport.matches ? 1 : 2)
function syncDetailsColumns() {
  detailsColumns.value = narrowViewport.matches ? 1 : 2
}
onMounted(() => narrowViewport.addEventListener('change', syncDetailsColumns))
onBeforeUnmount(() => narrowViewport.removeEventListener('change', syncDetailsColumns))
const loadError = ref('')
const channels = ref<MessageChannel[]>([])
const catalog = ref<{ kinds: MessageChannelKind[]; providers: MessageProviderMeta[] }>({
  kinds: [],
  providers: [],
})

const KIND_GROUPS: { kind: MessageChannelKind; label: string; desc: string }[] = [
  { kind: 'sms', label: '短信', desc: '选择一家供应商，填写签名、凭据和模板编号' },
  { kind: 'email', label: '邮箱', desc: 'SMTP 主机、端口与授权码' },
  { kind: 'inapp', label: '站内信', desc: '站内通知，无需外部凭据' },
]

async function load() {
  loading.value = true
  try {
    const [list, meta] = await Promise.all([fetchMessageChannels(), fetchMessageChannelCatalog()])
    channels.value = list
    catalog.value = meta
    loadError.value = ''
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '渠道列表加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** 与服务端投递选择顺序一致，兼容已有多供应商记录；保存后只保留一个生效配置。 */
function channelOfKind(kind: MessageChannelKind): MessageChannel | undefined {
  return fixedChannelOfKind(channels.value, kind)
}
function openConfigure(kind: MessageChannelKind) {
  const row = channelOfKind(kind)
  if (row) openEdit(row)
  else openCreate(kind)
}
const mappings = ref<{ code: string; templateId: string }[]>([])
const advanced = ref<(string | number)[]>([])
const isSms = computed(() => form.kind === 'sms')
const basicFields = computed(() => (currentMeta.value?.configFields ?? []).filter(field =>
  isSms.value ? ['signName', 'sdkAppId'].includes(field.key) : !['domainVerified'].includes(field.key)))
const advancedFields = computed(() => (currentMeta.value?.configFields ?? []).filter(field =>
  isSms.value ? !['signName', 'sdkAppId', 'templateMapping'].includes(field.key) : field.key === 'domainVerified'))
function readMappings() {
  const raw = form.config.templateMapping
  const parsed = raw ? JSON.parse(raw) as Record<string, string> : {}
  mappings.value = Object.entries(parsed).map(([code, templateId]) => ({ code, templateId: String(templateId) }))
  if (!mappings.value.length) mappings.value = [{ code: 'verify_code', templateId: '' }]
}

const formVisible = ref(false)
const formRef = ref()
const form = reactive({
  kind: 'sms' as MessageChannelKind,
  provider: 'aliyun_sms',
  name: '',
  enabled: false,
  dailyLimit: 0,
  remark: '',
  config: {} as Record<string, string>,
  credentialMode: 'inline' as 'inline' | 'env',
  credentialEnv: {} as Record<string, string>,
})

const providerOptions = computed(() => catalog.value.providers
  .filter(provider => provider.supports.includes(form.kind) && provider.provider !== 'dry_run')
  .map(provider => ({ label: provider.label, value: provider.provider })))

const currentMeta = computed(() => catalog.value.providers.find((p) => p.provider === form.provider))

/** 是否 SMTP 邮件渠道（用于联动提示） */
const isSmtp = computed(() => form.provider === 'smtp')

/** SMTP 发件人与认证用户一致性提示（仅 inline 模式且认证用户为邮箱时判断） */
const smtpFromMismatch = computed<{ message: string } | null>(() => {
  if (!isSmtp.value) return null
  const fromAddress = String(form.config.fromAddress ?? '').trim().toLowerCase()
  const user = String(form.credentialEnv.user ?? '').trim()
  if (!fromAddress || !user || form.credentialMode !== 'inline' || !user.includes('@')) return null
  if (user.toLowerCase() !== fromAddress) {
    return {
      message: '发件人邮箱与认证用户名不一致：QQ/163/新浪/企业邮等要求二者完全一致，否则发信会被拒（553），请设为同一邮箱。',
    }
  }
  return null
})

/** 凭据项补充说明（如 SMTP 认证用户名/授权码提示） */
function credentialFieldMeta(key: string): { label?: string; hint?: string } | undefined {
  return currentMeta.value?.credentialConfigFields?.find((field) => field.key === key)
}

function resetProviderFields() {
  form.config = {}
  credentialMasked.value = {}
  mappings.value = [{ code: 'verify_code', templateId: '' }]
  form.credentialEnv = {}
  for (const key of currentMeta.value?.credentialKeys ?? []) {
    form.credentialEnv[key] = ''
  }
  void nextTick(() => formRef.value?.clearValidate?.())
}

/* ---------- 凭据来源（inline 直接填写 / env 环境变量名） ---------- */
const credentialMasked = ref<Record<string, string>>({})

function onCredentialModeChange(mode: 'inline' | 'env') {
  form.credentialMode = mode
  form.credentialEnv = {}
  for (const key of currentMeta.value?.credentialKeys ?? []) {
    form.credentialEnv[key] = ''
  }
}

function credentialModeHint(): string {
  return form.credentialMode === 'inline'
    ? '凭据仅供服务端调用，填写后不再回显；同一供应商留空保持原值，切换供应商需重新填写'
    : '仅登记环境变量名，值由部署侧注入（大写字母开头，仅含大写字母/数字/下划线）'
}

function credentialLabel(key: string): string {
  const label = credentialFieldMeta(key)?.label ?? ({ accessKeyId: 'AccessKey ID', accessKeySecret: 'AccessKey Secret', secretId: 'SecretId', secretKey: 'SecretKey' } as Record<string, string>)[key] ?? key
  return form.credentialMode === 'env' ? `${label}（环境变量名）` : label
}

function credentialHint(key: string): string {
  const meta = credentialFieldMeta(key)
  if (meta?.hint) return meta.hint
  if (form.credentialMode === 'inline') {
    return credentialMasked.value[key] ? '已配置，留空则保持不变' : '尚未配置'
  }
  return '环境变量名'
}

function credentialPlaceholder(key: string): string {
  if (form.credentialMode === 'env') return '环境变量名，如 ALIYUN_SMS_ACCESS_KEY_ID…'
  const masked = credentialMasked.value[key]
  return masked ? `${masked}（留空保持不变）…` : '请输入密钥…'
}

function openCreate(kind: MessageChannelKind = 'sms') {
  form.kind = kind
  form.provider = providerOptions.value[0]?.value ?? ''
  if (!form.provider) {
    MessagePlugin.info('通知供应商目录尚未加载，请重试')
    return
  }
  form.name = `${KIND_GROUPS.find(group => group.kind === kind)?.label ?? ''}通知`
  form.enabled = false
  form.dailyLimit = 0
  form.remark = ''
  form.credentialMode = 'inline'
  credentialMasked.value = {}
  resetProviderFields()
  advanced.value = []
  readMappings()
  formVisible.value = true
  void nextTick(() => formRef.value?.clearValidate?.())
}

function openEdit(row: MessageChannel) {
  form.kind = row.kind
  form.provider = row.provider
  form.name = row.name
  form.enabled = row.enabled
  form.dailyLimit = row.dailyLimit
  form.remark = row.remark ?? ''
  form.config = {}
  for (const [key, value] of Object.entries(row.config ?? {})) {
    form.config[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  /* SMTP 旧版单字段 from（如 聚屿社区 <no-reply@example.com>） → 拆分为地址 + 显示名 */
  if (row.provider === 'smtp' && !form.config.fromAddress && form.config.from) {
    const parsed = legacyFromToFields(String(form.config.from))
    if (parsed.fromAddress) {
      form.config.fromAddress = parsed.fromAddress
      if (parsed.fromName && !form.config.fromName) form.config.fromName = parsed.fromName
    }
  }
  form.credentialMode = row.credentialMode ?? 'env'
  credentialMasked.value = row.credentialMasked ?? {}
  form.credentialEnv = {}
  for (const key of currentMeta.value?.credentialKeys ?? []) {
    form.credentialEnv[key] = row.credentialEnv?.[key] ?? ''
  }
  advanced.value = []
  readMappings()
  formVisible.value = true
  void nextTick(() => formRef.value?.clearValidate?.())
}

/** 组装非机密配置：templateMapping 必须是对象，其余为字符串 */
function buildConfig(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of Object.keys(form.config).filter(key => key !== 'templateMapping').map(key => ({ key, label: key }))) {
    const raw = String(form.config[field.key] ?? '').trim()
    if (!raw) continue
    if (field.key === 'templateMapping' || field.key === 'templateParamOrder') {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        throw new Error(`${field.label} 须为 JSON 对象`)
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${field.label} 须为 JSON 对象`)
      }
      out[field.key] = parsed
      continue
    }
    out[field.key] = raw
  }
  if (isSms.value) {
    out.templateMapping = buildSmsTemplateMapping(mappings.value)
  }
  return out
}

function validateSmsMappings() {
  try { buildSmsTemplateMapping(mappings.value); return true }
  catch (error) { return { result: false, message: error instanceof Error ? error.message : '请核对短信模板' } }
}

function buildCredentialEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of currentMeta.value?.credentialKeys ?? []) {
    const value = String(form.credentialEnv[key] ?? '').trim()
    if (value) out[key] = value
  }
  return out
}

/* 提交互斥：避免重复点击产生并发保存/测试请求 */
const saving = ref(false)

async function onSave() {
  if (saving.value) return
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  saving.value = true
  try {
    const payload = {
      kind: form.kind,
      provider: form.provider,
      name: form.name.trim(),
      enabled: form.enabled,
      config: buildConfig(),
      credentialMode: form.credentialMode,
      credentialEnv: buildCredentialEnv(),
      dailyLimit: form.dailyLimit,
      remark: form.remark.trim(),
    }
    await saveFixedMessageChannel(payload)
    formVisible.value = false
    MessagePlugin.success('通知配置已保存')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

/* ---------- 测试发送 ---------- */
const testVisible = ref(false)
const testRef = ref()
const testTarget = ref<MessageChannel | null>(null)
const testForm = reactive({ recipient: '', subject: '', body: '', templateCode: '' })
/* 模板变量：选中模板后按其变量白名单动态生成输入项，避免手写 JSON 漏填/填错——
 * 短信通道的变量个数必须与供应商已审批模板的模板一致，参数个数不符会被供应商直接拒绝 */
const testVarNames = ref<string[]>([])
const testVarValues = reactive<Record<string, string>>({})
const testTemplates = ref<MessageTemplate[]>([])
const templatesLoading = ref(false)
/* 表单数据需含变量值，TDesign 校验按 name 在 data 中取值 */
const testFormData = computed(() => ({ ...testForm, ...testVarValues }))
const testTemplateOptions = computed(() =>
  testTemplates.value.map((item) => ({ label: `${item.name}（${item.code}）`, value: item.code })),
)

async function loadTestTemplates(kind: MessageChannelKind) {
  templatesLoading.value = true
  try {
    const all = await fetchMessageTemplates()
    testTemplates.value = all.filter((item) => item.kind === kind)
  } catch {
    /* 模板列表拉取失败不阻塞测试发送：仍可用「正文」做连通性验证 */
    testTemplates.value = []
  } finally {
    templatesLoading.value = false
  }
}

function clearTestVariables() {
  testVarNames.value = []
  for (const key of Object.keys(testVarValues)) delete testVarValues[key]
  testForm.templateCode = ''
}

function applyTemplateVariables() {
  const picked = testTemplates.value.find((item) => item.code === testForm.templateCode)
  testVarNames.value = picked ? [...picked.variables] : []
  for (const key of Object.keys(testVarValues)) delete testVarValues[key]
}

function collectTestVariables(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of testVarNames.value) out[name] = (testVarValues[name] ?? '').trim()
  return out
}

function openTest(row: MessageChannel) {
  testTarget.value = row
  testForm.recipient = ''
  testForm.subject = ''
  testForm.body = ''
  clearTestVariables()
  testVisible.value = true
  void loadTestTemplates(row.kind)
  void testRef.value?.clearValidate?.()
}

const testing = ref(false)

async function onTestSend() {
  if (!testTarget.value || testing.value) return
  const valid = await testRef.value.validate()
  if (valid !== true) return focusFirstInvalid(testRef.value)
  testing.value = true
  try {
    const result = await testSendMessageChannel(testTarget.value.id, {
      recipient: testForm.recipient.trim(),
      subject: testForm.subject.trim() || undefined,
      body: testForm.body.trim() || undefined,
      templateCode: testForm.templateCode || undefined,
      variables: collectTestVariables(),
    })
    testVisible.value = false
    const suffix = result.dryRun ? '（凭据未注入，已干跑）' : ''
    MessagePlugin.success(`测试发送成功${suffix} · 回执 ${result.providerMessageId ?? '—'} · ${result.costMs}ms`)
    if (result.warnings?.length) {
      MessagePlugin.warning(result.warnings.join('\n'))
    }
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '测试发送失败')
  } finally {
    testing.value = false
  }
}

/** 解析 SMTP 旧式发件人字符串（显示名 <邮箱> 或纯邮箱） */
function legacyFromToFields(value: string): { fromName: string; fromAddress: string } {
  const match = value.trim().match(/^(.*?)<\s*([^<>@\s]+@[^<>\s]+)\s*>$/)
  if (match) {
    return {
      fromAddress: match[2].trim(),
      fromName: match[1].trim().replace(/^["']|["']$/g, '').trim(),
    }
  }
  return { fromAddress: value.trim(), fromName: '' }
}

/** 凭据就绪状态：统一走 statusMap.messageCredential（已配置 / 凭据缺失 / 未配置） */
function credentialStatus(row: MessageChannel): 'configured' | 'missing' | 'none' {
  if (row.credentialConfigured) return 'configured'
  return row.missingCredentials.length ? 'missing' : 'none'
}
const { close: closeForm } = useDialogFormProtection(() => ({ form, mappings: mappings.value }), formVisible, saving)
const { close: closeTestDialog } = useDialogFormProtection(testForm, testVisible, testing)
</script>

<template>
  <div class="channel-panel">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <t-loading :loading="loading">
      <t-card v-for="group in KIND_GROUPS" :key="group.kind" :title="`${group.label}配置`" class="kind-section">
        <template #actions>
          <t-button theme="primary" variant="outline" :disabled="loading || !!loadError" @click="openConfigure(group.kind)">配置{{ group.label }}</t-button>
        </template>
        <p class="muted">{{ group.desc }}</p>
      <t-descriptions v-if="channelOfKind(group.kind)" class="channel-details" bordered :column="detailsColumns" size="small">
          <t-descriptions-item label="供应商">{{ channelOfKind(group.kind)!.providerLabel }}</t-descriptions-item>
          <t-descriptions-item label="状态"><t-tag :theme="channelOfKind(group.kind)!.enabled ? 'success' : 'default'">{{ channelOfKind(group.kind)!.enabled ? '已启用' : '未启用' }}</t-tag></t-descriptions-item>
          <t-descriptions-item label="凭据"><StatusTag entity="messageCredential" :value="credentialStatus(channelOfKind(group.kind)!)" /></t-descriptions-item>
          <t-descriptions-item label="最近保存">{{ channelOfKind(group.kind)!.updatedAt || '—' }}</t-descriptions-item>
        </t-descriptions>
        <t-alert v-else theme="info" :message="`尚未配置${group.label}通知，请点击「配置${group.label}」完成设置。`" />
        <t-button v-if="channelOfKind(group.kind)" variant="text" :disabled="loading || !!loadError" @click="openTest(channelOfKind(group.kind)!)">测试{{ group.label }}发送</t-button>
      </t-card>
    </t-loading>

    <t-dialog
      :visible="formVisible"
      :header="`${KIND_GROUPS.find(group => group.kind === form.kind)?.label}配置`"
      width="640px"
     @close="closeForm">
      <t-form ref="formRef" :data="form" label-align="top" :disabled="saving">
        <div class="form-grid">
          <t-form-item label="通知供应商" name="provider" :rules="[{ required: true, message: '请选择通知供应商', trigger: 'submit' }]">
            <t-select
              v-accessible-field
              v-model="form.provider"
              :options="providerOptions"
              @change="resetProviderFields"
            />
          </t-form-item>
          <t-form-item label="启用通知" name="enabled">
            <t-switch v-model="form.enabled" v-accessible-field="'启用通知'" aria-label="启用通知" />
          </t-form-item>
        </div>

        <template v-if="currentMeta?.configFields?.length">
          <div class="section-title">通道参数</div>
          <t-alert
            v-if="isSmtp"
            class="smtp-tip"
            theme="info"
            :message="'QQ/163/新浪/企业邮等 SMTP 要求「发件人邮箱地址」与「认证用户名」完全一致，密码处填「授权码」而非登录密码（需先在邮箱设置开启 SMTP 服务）。显示名称可任意。'"
          />
          <div class="form-grid">
            <t-form-item
              v-for="field in basicFields"
              :key="field.key"
              :label="field.label"
              :name="`config.${field.key}`"
              :rules="field.required ? [{ required: true, message: `请填写${field.label}`, trigger: 'submit' }] : []"
            >
              <t-switch v-if="field.key === 'secure'" v-accessible-field="field.label" :value="form.config[field.key] === 'true'" :aria-label="field.label" @change="(value: boolean) => form.config[field.key] = String(value)" />
              <t-input v-else v-accessible-field v-model="form.config[field.key]" clearable :placeholder="(field.hint || '') + '…'" />
              <template #help>
                <span v-if="field.key === 'fromAddress' && smtpFromMismatch" class="help-warning">{{ smtpFromMismatch.message }}</span>
                <span v-else>{{ field.hint || '' }}</span>
              </template>
            </t-form-item>
          </div>
        </template>

        <template v-if="currentMeta?.credentialKeys?.length">
          <div class="section-title">凭据</div>
          <p class="muted">{{ credentialModeHint() }}</p>
          <div class="form-grid">
            <t-form-item
              v-for="key in currentMeta.credentialKeys"
              :key="key"
              :label="credentialLabel(key)"
              :name="`credentialEnv.${key}`"
            >
              <t-input
                v-accessible-field
                v-model="form.credentialEnv[key]"
                  :type="form.credentialMode === 'inline' && /secret|password|token|appcode/i.test(key) ? 'password' : 'text'"
                clearable
                autocomplete="off"
                :placeholder="credentialPlaceholder(key)"
              />
              <template #help>{{ credentialHint(key) }}</template>
            </t-form-item>
          </div>
        </template>

        <t-form-item v-if="isSms" label="短信模板" name="config.templateMapping" :rules="[{ validator: validateSmsMappings, trigger: 'submit' }]">
          <div class="mapping-fields">
            <p class="muted">填写供应商审核通过的模板编号。验证码的通知编码为 verify_code。</p>
            <div v-for="(mapping, index) in mappings" :key="index" class="mapping-row">
              <t-input v-model="mapping.code" @change="formRef?.clearValidate(['config.templateMapping'])" v-accessible-field="`短信模板 ${index + 1} 通知编码`" :aria-label="`短信模板 ${index + 1} 通知编码`" placeholder="通知编码，如 verify_code…" />
              <t-input v-model="mapping.templateId" @change="formRef?.clearValidate(['config.templateMapping'])" v-accessible-field="`短信模板 ${index + 1} 供应商编号`" :aria-label="`短信模板 ${index + 1} 供应商编号`" placeholder="供应商模板编号…" />
              <t-button variant="text" theme="danger" :aria-label="`移除短信模板 ${index + 1}`" @click="mappings.splice(index, 1)">移除</t-button>
            </div>
            <t-button variant="outline" @click="mappings.push({ code: '', templateId: '' })">添加模板对应关系</t-button>
          </div>
        </t-form-item>
        <t-collapse v-model="advanced" class="advanced-settings">
          <t-collapse-panel value="advanced" header="高级设置（选填）" :destroy-on-collapse="false">
          <t-form-item v-if="currentMeta?.credentialKeys?.length" label="凭据来源" name="credentialMode">
            <t-select
              v-accessible-field
              :value="form.credentialMode"
              :options="[
                { label: '直接填写密钥（推荐）', value: 'inline' },
                { label: '登记环境变量名', value: 'env' },
              ]"
              @change="(value: unknown) => onCredentialModeChange(String(value) as 'inline' | 'env')"
            />
            <template #help>{{ credentialModeHint() }}</template>
          </t-form-item>

            <t-form-item v-for="field in advancedFields" :key="field.key" :label="field.label" :name="`config.${field.key}`" :help="field.hint">
              <t-input v-accessible-field v-model="form.config[field.key]" clearable :placeholder="field.hint || '使用默认值'" />
            </t-form-item>
            <t-form-item label="每日发送上限" name="dailyLimit" help="0 表示不限制">
              <t-input-number v-accessible-field v-model="form.dailyLimit" :min="0" :max="100000" :decimal-places="0" />
            </t-form-item>
            <t-form-item label="备注" name="remark"><t-input v-accessible-field v-model="form.remark" :maxlength="255" /></t-form-item>
          </t-collapse-panel>
        </t-collapse>
      </t-form>
      <template #footer>
        <div class="dialog-footer">
          <t-button theme="default" @click="closeForm">取消</t-button>
          <t-button theme="primary" :loading="saving" @click="onSave()">保存配置</t-button>
        </div>
      </template>
    </t-dialog>

    <t-dialog
      :visible="testVisible" @close="closeTestDialog"
      header="测试发送"
      width="560px"
      :confirm-btn="{ content: '发送', theme: 'primary', loading: testing }"
      @confirm="onTestSend"
    >
      <t-form ref="testRef" :data="testFormData" label-align="top">
        <t-form-item label="收件人" name="recipient" :rules="[{ required: true, message: '请输入测试收件人' }]">
          <t-input v-accessible-field v-model="testForm.recipient" clearable :placeholder="testTarget?.kind === 'email' ? '邮箱…' : '手机号…'" />
        </t-form-item>
        <t-form-item label="模板" name="templateCode">
          <t-select
            v-accessible-field
            v-model="testForm.templateCode"
            :options="testTemplateOptions"
            :loading="templatesLoading"
            clearable
            filterable
            placeholder="选择模板后自动列出变量（与正文二选一）…"
            @change="applyTemplateVariables"
          />
        </t-form-item>
        <!-- 变量输入项按所选模板的变量白名单动态生成：短信通道的参数个数必须与供应商已审批模板一致，
             传错个数会被供应商拒绝（如腾讯云 TemplateParamSetNotMatchApprovedTemplate） -->
        <t-form-item
          v-for="name in testVarNames"
          :key="name"
          :label="`变量 ${name}`"
          :name="name"
          :rules="[{ required: true, message: `请输入变量 ${name} 的值` }]"
        >
          <t-input v-accessible-field v-model="testVarValues[name]" clearable :placeholder="`变量 ${name} 的值…`" />
        </t-form-item>
        <t-form-item label="正文（直接指定时优先）" name="body">
          <t-textarea v-accessible-field v-model="testForm.body" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="留空则按模板编码渲染…" />
        </t-form-item>
        <t-form-item v-if="testTarget?.kind === 'email'" label="邮件主题" name="subject">
          <t-input v-accessible-field v-model="testForm.subject" clearable placeholder="仅邮件渠道使用…" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.mapping-fields { width: 100%; }
.mapping-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-bottom: 12px; }
.advanced-settings { margin-top: 24px; }
@media (max-width: 640px) { .mapping-row { grid-template-columns: 1fr; } }

.section-title {
  margin: 8px 0 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}

.muted {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.smtp-tip {
  margin-bottom: 16px;
}

.help-warning {
  color: var(--td-error-color);
  white-space: pre-line;
}

.kind-section { margin-bottom: 16px; }
.channel-details { margin: 16px 0 8px; }
</style>
