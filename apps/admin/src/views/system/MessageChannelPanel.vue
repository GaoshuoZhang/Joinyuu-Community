<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import {
  fetchMessageChannelCatalog,
  fetchMessageChannels,
  saveMessageChannel,
  testSendMessageChannel,
  toggleMessageChannel,
} from '@/api/messageChannels'
import type {
  MessageChannel,
  MessageChannelKind,
  MessageProviderMeta,
} from '@/types'

/* 消息中心 · 渠道配置（P0）：非机密配置在后台维护，凭据只登记环境变量名（值由部署侧注入）。
 * 凭据未注入时，非生产环境的「测试发送」会降级为干跑，便于先打通链路。 */
const loading = ref(true)
const loadError = ref('')
const channels = ref<MessageChannel[]>([])
const catalog = ref<{ kinds: MessageChannelKind[]; providers: MessageProviderMeta[] }>({
  kinds: [],
  providers: [],
})

const KIND_LABEL: Record<string, string> = { sms: '短信', email: '邮件', inapp: '站内信' }

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

const columns = [
  { colKey: 'name', title: '渠道名称', width: 200 },
  { colKey: 'kind', title: '类型', width: 90 },
  { colKey: 'provider', title: '驱动', width: 180 },
  { colKey: 'enabled', title: '启用', width: 90 },
  { colKey: 'credential', title: '凭据', width: 180 },
  { colKey: 'dailyLimit', title: '每日上限', width: 110 },
  { colKey: 'updatedAt', title: '最近保存', width: 170 },
  { colKey: 'op', title: '操作', width: 170, fixed: 'right' as const },
]

async function onToggle(row: MessageChannel, value: boolean) {
  const previous = row.enabled
  row.enabled = value
  try {
    await toggleMessageChannel(row.id, value)
    MessagePlugin.success(value ? '渠道已启用' : '渠道已停用')
  } catch (error) {
    row.enabled = previous
    MessagePlugin.error(error instanceof Error ? error.message : '操作失败')
  }
}

/* ---------- 新增 / 编辑 ---------- */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formRef = ref()
const editingId = ref('')
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

const providerOptions = computed(() =>
  catalog.value.providers
    .filter((p) => p.supports.includes(form.kind))
    .map((p) => ({ label: p.label, value: p.provider })),
)

const currentMeta = computed(() => catalog.value.providers.find((p) => p.provider === form.provider))

function onKindChange(kind: MessageChannelKind) {
  form.kind = kind
  const first = catalog.value.providers.find((p) => p.supports.includes(kind))
  form.provider = first?.provider ?? ''
  resetProviderFields()
}

function resetProviderFields() {
  form.config = {}
  form.credentialEnv = {}
  for (const key of currentMeta.value?.credentialKeys ?? []) {
    form.credentialEnv[key] = ''
  }
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
    ? '密钥写入数据库仅供服务端调用：接口不回传、审计不记录；留空表示保持原值'
    : '仅登记环境变量名，值由部署侧注入（大写字母开头，仅含大写字母/数字/下划线）'
}

function credentialLabel(key: string): string {
  return form.credentialMode === 'env' ? `${key}（环境变量名）` : key
}

function credentialPlaceholder(key: string): string {
  if (form.credentialMode === 'env') return '环境变量名，如 ALIYUN_SMS_ACCESS_KEY_ID…'
  const masked = credentialMasked.value[key]
  return masked ? `${masked}（留空保持不变）…` : '请输入密钥…'
}

function openCreate() {
  formMode.value = 'create'
  editingId.value = ''
  form.kind = 'sms'
  form.provider = 'aliyun_sms'
  form.name = ''
  form.enabled = false
  form.dailyLimit = 0
  form.remark = ''
  form.credentialMode = 'inline'
  credentialMasked.value = {}
  resetProviderFields()
  formVisible.value = true
  void formRef.value?.clearValidate?.()
}

function openEdit(row: MessageChannel) {
  formMode.value = 'edit'
  editingId.value = row.id
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
  form.credentialMode = row.credentialMode ?? 'env'
  credentialMasked.value = row.credentialMasked ?? {}
  form.credentialEnv = {}
  for (const key of currentMeta.value?.credentialKeys ?? []) {
    form.credentialEnv[key] = row.credentialEnv?.[key] ?? ''
  }
  formVisible.value = true
  void formRef.value?.clearValidate?.()
}

/** 组装非机密配置：templateMapping 必须是对象，其余为字符串 */
function buildConfig(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of currentMeta.value?.configFields ?? []) {
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
  return out
}

function buildCredentialEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of currentMeta.value?.credentialKeys ?? []) {
    const value = String(form.credentialEnv[key] ?? '').trim()
    if (value) out[key] = value
  }
  return out
}

async function onSave() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
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
    await saveMessageChannel(payload)
    formVisible.value = false
    MessagePlugin.success(formMode.value === 'edit' ? '渠道已保存' : '渠道已新增')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
  }
}

/* ---------- 测试发送 ---------- */
const testVisible = ref(false)
const testRef = ref()
const testTarget = ref<MessageChannel | null>(null)
const testForm = reactive({ recipient: '', subject: '', body: '', templateCode: '', variables: '' })

function openTest(row: MessageChannel) {
  testTarget.value = row
  testForm.recipient = ''
  testForm.subject = ''
  testForm.body = ''
  testForm.templateCode = ''
  testForm.variables = '{}'
  testVisible.value = true
  void testRef.value?.clearValidate?.()
}

function parseVariables(): Record<string, string> {
  const raw = testForm.variables.trim()
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('模板变量须为 JSON 对象')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('模板变量须为 JSON 对象')
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    out[key] = value == null ? '' : String(value)
  }
  return out
}

async function onTestSend() {
  if (!testTarget.value) return
  const valid = await testRef.value.validate()
  if (valid !== true) return
  try {
    const result = await testSendMessageChannel(testTarget.value.id, {
      recipient: testForm.recipient.trim(),
      subject: testForm.subject.trim() || undefined,
      body: testForm.body.trim() || undefined,
      templateCode: testForm.templateCode.trim() || undefined,
      variables: parseVariables(),
    })
    testVisible.value = false
    const suffix = result.dryRun ? '（凭据未注入，已干跑）' : ''
    MessagePlugin.success(`测试发送成功${suffix} · 回执 ${result.providerMessageId ?? '—'} · ${result.costMs}ms`)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '测试发送失败')
  }
}

function credentialTagText(row: MessageChannel): string {
  if (row.credentialConfigured) return '已配置'
  return row.missingCredentials.length ? `缺少 ${row.missingCredentials.length} 项` : '未配置'
}
</script>

<template>
  <div class="channel-panel page-fade-in">
    <PageHeader title="渠道配置" description="短信 / 邮件 / 站内信通道；凭据只登记环境变量名，不在后台保存明文">
      <template #actions>
        <t-button theme="primary" @click="openCreate">新增渠道</t-button>
      </template>
    </PageHeader>

    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <t-card :bordered="true" class="channel-card">
      <t-table
        row-key="id"
        :data="channels"
        :columns="columns"
        :loading="loading"
        table-layout="fixed"
        hover
      >
        <template #kind="{ row }">
          <t-tag variant="light-outline" size="small">{{ KIND_LABEL[row.kind] || row.kind }}</t-tag>
        </template>
        <template #provider="{ row }">
          <span>{{ row.providerLabel }}</span>
        </template>
        <template #enabled="{ row }">
          <t-switch :value="row.enabled" @change="(value: boolean) => onToggle(row, value)" />
        </template>
        <template #credential="{ row }">
          <t-tooltip :content="row.missingCredentials.join('、') || '环境变量已齐备'">
            <t-tag :theme="row.credentialConfigured ? 'success' : 'warning'" variant="light" size="small">
              {{ credentialTagText(row) }}
            </t-tag>
          </t-tooltip>
        </template>
        <template #dailyLimit="{ row }">
          <span>{{ row.dailyLimit > 0 ? row.dailyLimit : '不限' }}</span>
        </template>
        <template #op="{ row }">
          <t-space size="small">
            <t-link theme="primary" hover="color" @click="openEdit(row)">编辑</t-link>
            <t-link theme="primary" hover="color" @click="openTest(row)">测试发送</t-link>
          </t-space>
        </template>
      </t-table>
    </t-card>

    <t-dialog
      v-model:visible="formVisible"
      :header="formMode === 'edit' ? '编辑渠道' : '新增渠道'"
      width="640px"
      :confirm-btn="{ content: '保存', theme: 'primary' }"
      @confirm="onSave"
    >
      <t-form ref="formRef" :data="form" label-align="top">
        <div class="form-grid">
          <t-form-item label="消息类型" name="kind" :rules="[{ required: true, message: '请选择消息类型' }]">
            <t-select
              :value="form.kind"
              :disabled="formMode === 'edit'"
              :options="catalog.kinds.map((k) => ({ label: KIND_LABEL[k] || k, value: k }))"
              @change="(value: unknown) => onKindChange(value as MessageChannelKind)"
            />
          </t-form-item>
          <t-form-item label="消息驱动" name="provider" :rules="[{ required: true, message: '请选择消息驱动' }]">
            <t-select
              v-model="form.provider"
              :disabled="formMode === 'edit'"
              :options="providerOptions"
              @change="resetProviderFields"
            />
          </t-form-item>
          <t-form-item label="渠道名称" name="name" :rules="[{ required: true, message: '请输入渠道名称' }]">
            <t-input v-model="form.name" clearable placeholder="如 阿里云短信主通道…" />
          </t-form-item>
          <t-form-item label="每日发送上限" name="dailyLimit">
            <t-input-number v-model="form.dailyLimit" :min="0" :max="100000" :step="100" theme="column" style="width: 200px" />
            <template #help>0 表示不限制</template>
          </t-form-item>
        </div>

        <template v-if="currentMeta?.configFields?.length">
          <div class="section-title">通道参数</div>
          <div class="form-grid">
            <t-form-item
              v-for="field in currentMeta.configFields"
              :key="field.key"
              :label="field.label"
              :name="`config.${field.key}`"
              :rules="field.required ? [{ required: true, message: `请填写${field.label}` }] : []"
            >
              <t-input v-model="form.config[field.key]" clearable :placeholder="(field.hint || '') + '…'" />
              <template #help>{{ field.hint || '' }}</template>
            </t-form-item>
          </div>
        </template>

        <template v-if="currentMeta?.credentialKeys?.length">
          <div class="section-title">凭据</div>
          <t-form-item label="凭据来源" name="credentialMode">
            <t-select
              :value="form.credentialMode"
              :options="[
                { label: '直接填写密钥（推荐）', value: 'inline' },
                { label: '登记环境变量名', value: 'env' },
              ]"
              @change="(value: unknown) => onCredentialModeChange(String(value) as 'inline' | 'env')"
            />
            <template #help>{{ credentialModeHint() }}</template>
          </t-form-item>
          <div class="form-grid">
            <t-form-item
              v-for="key in currentMeta.credentialKeys"
              :key="key"
              :label="credentialLabel(key)"
              :name="`credentialEnv.${key}`"
            >
              <t-input
                v-model="form.credentialEnv[key]"
                clearable
                autocomplete="off"
                :placeholder="credentialPlaceholder(key)"
              />
              <template #help>
                <span v-if="form.credentialMode === 'inline'">
                  {{ credentialMasked[key] ? '已配置，留空则保持不变' : '尚未配置' }}
                </span>
                <span v-else>环境变量名</span>
              </template>
            </t-form-item>
          </div>
        </template>

        <t-form-item label="备注" name="remark">
          <t-input v-model="form.remark" clearable placeholder="选填…" />
        </t-form-item>
        <t-form-item label="启用" name="enabled">
          <t-switch v-model="form.enabled" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <t-dialog
      v-model:visible="testVisible"
      header="测试发送"
      width="560px"
      :confirm-btn="{ content: '发送', theme: 'primary' }"
      @confirm="onTestSend"
    >
      <t-form ref="testRef" :data="testForm" label-align="top">
        <t-form-item label="收件人" name="recipient" :rules="[{ required: true, message: '请输入测试收件人' }]">
          <t-input v-model="testForm.recipient" clearable :placeholder="testTarget?.kind === 'email' ? '邮箱…' : '手机号…'" />
        </t-form-item>
        <t-form-item label="模板编码" name="templateCode">
          <t-input v-model="testForm.templateCode" clearable placeholder="如 verify_code（与正文二选一）…" />
        </t-form-item>
        <t-form-item label="模板变量（JSON）" name="variables">
          <t-input v-model="testForm.variables" clearable placeholder='如 {"code":"1234"}…' />
        </t-form-item>
        <t-form-item label="正文（直接指定时优先）" name="body">
          <t-textarea v-model="testForm.body" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="留空则按模板编码渲染…" />
        </t-form-item>
        <t-form-item label="邮件主题" name="subject">
          <t-input v-model="testForm.subject" clearable placeholder="仅邮件渠道使用…" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.channel-card {
  width: 100%;
}

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
</style>
