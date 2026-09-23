<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon } from 'tdesign-icons-vue-next'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
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

/* 消息中心 · 渠道配置（P0）：按 短信 / 邮箱 / 站内信 分块维护；
 * 非机密配置在后台直接维护，凭据支持「直接填写密钥」与「登记环境变量名」。
 * 配置后可在编辑弹窗内「保存并测试连通」，也可在列表行直接测试发送。 */
const loading = ref(true)
const loadError = ref('')
const channels = ref<MessageChannel[]>([])
const catalog = ref<{ kinds: MessageChannelKind[]; providers: MessageProviderMeta[] }>({
  kinds: [],
  providers: [],
})

const KIND_GROUPS: { kind: MessageChannelKind; label: string; desc: string }[] = [
  { kind: 'sms', label: '短信', desc: '阿里云 / 腾讯云短信签名与模板映射' },
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

const columns = [
  { colKey: 'name', title: '渠道名称', width: 200 },
  { colKey: 'provider', title: '驱动', width: 180 },
  { colKey: 'enabled', title: '启用', width: 90 },
  { colKey: 'credential', title: '凭据', width: 180 },
  { colKey: 'dailyLimit', title: '每日上限', width: 110 },
  { colKey: 'updatedAt', title: '最近保存', width: 170 },
  { colKey: 'op', title: '操作', width: 170, fixed: 'right' as const },
]

/** 分组卡片内的表格列（去类型列，由卡片标题体现） */
const groupedColumns = columns.filter((col) => col.colKey !== 'kind')

function channelsOfKind(kind: MessageChannelKind): MessageChannel[] {
  return channels.value.filter((c) => c.kind === kind)
}

/* 启停切换互斥：请求期间该行开关保持 loading，避免并发切换 */
const toggling = ref('')

async function onToggle(row: MessageChannel, value: boolean) {
  if (toggling.value) return
  const previous = row.enabled
  row.enabled = value
  toggling.value = row.id
  try {
    await toggleMessageChannel(row.id, value)
    MessagePlugin.success(value ? '渠道已启用' : '渠道已停用')
  } catch (error) {
    row.enabled = previous
    MessagePlugin.error(error instanceof Error ? error.message : '操作失败')
  } finally {
    toggling.value = ''
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
  return credentialFieldMeta(key)?.label ?? (form.credentialMode === 'env' ? `${key}（环境变量名）` : key)
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
  formMode.value = 'create'
  editingId.value = ''
  form.kind = kind
  form.provider = catalog.value.providers.find((p) => p.supports.includes(kind))?.provider ?? ''
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

/* 提交互斥：避免重复点击产生并发保存/测试请求 */
const saving = ref(false)

async function onSave(testAfter = false) {
  if (saving.value) return
  const valid = await formRef.value.validate()
  if (valid !== true) return
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
    const { id } = await saveMessageChannel(payload)
    formVisible.value = false
    MessagePlugin.success(formMode.value === 'edit' ? '渠道已保存' : '渠道已新增')
    await load()
    if (testAfter) {
      const target = channels.value.find((row) => row.id === id)
      if (target) openTest(target)
    }
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

const testing = ref(false)

async function onTestSend() {
  if (!testTarget.value || testing.value) return
  const valid = await testRef.value.validate()
  if (valid !== true) return
  testing.value = true
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
</script>

<template>
  <div class="channel-panel">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <!-- 新增入口只保留在分组标题上（按类型定向新增），避免与顶部通用入口重复；
         分组卡片由面板自带（聚合壳不再包 page-card） -->
    <section v-for="(group, index) in KIND_GROUPS" :key="group.kind" class="kind-section page-card" :class="{ 'is-first': index === 0 }">
      <div class="kind-head">
        <div class="kind-title-row">
          <span class="kind-title">{{ group.label }}配置</span>
          <span class="muted kind-desc">{{ group.desc }}</span>
        </div>
        <t-button theme="primary" variant="outline" size="small" @click="openCreate(group.kind)">
          <template #icon><AddIcon /></template>
          新增{{ group.label }}渠道
        </t-button>
      </div>
      <t-table
        row-key="id"
        :data="channelsOfKind(group.kind)"
        :columns="groupedColumns"
        :loading="loading"
        table-layout="fixed"
        hover
        resizable
      >
        <template #empty>
          <ListEmptyState :description="`暂无${group.label}渠道`" />
        </template>
        <template #provider="{ row }">
          <span>{{ row.providerLabel }}</span>
        </template>
        <template #enabled="{ row }">
          <t-switch
            :value="row.enabled"
            :loading="toggling === row.id"
            :aria-label="`渠道「${row.name}」启用状态`"
            @change="(value: boolean) => onToggle(row, value)"
          />
        </template>
        <template #credential="{ row }">
          <t-tooltip :content="row.missingCredentials.join('、') || '凭据已就绪'">
            <StatusTag entity="messageCredential" :value="credentialStatus(row)" size="small" />
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
    </section>

    <t-dialog
      v-model:visible="formVisible"
      :header="formMode === 'edit' ? '编辑渠道' : '新增渠道'"
      width="640px"
    >
      <t-form ref="formRef" :data="form" label-align="top">
        <div class="form-grid">
          <t-form-item label="消息类型" name="kind" :rules="[{ required: true, message: '请选择消息类型' }]">
            <t-select
              :value="form.kind"
              :disabled="formMode === 'edit'"
              :options="KIND_GROUPS.map((g) => ({ label: g.label, value: g.kind }))"
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
            <t-input-number class="ctl-w-lg" v-model="form.dailyLimit" :min="0" :max="100000" :step="100" theme="column" />
            <template #help>0 表示不限制</template>
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
              v-for="field in currentMeta.configFields"
              :key="field.key"
              :label="field.label"
              :name="`config.${field.key}`"
              :rules="field.required ? [{ required: true, message: `请填写${field.label}` }] : []"
            >
              <t-input v-model="form.config[field.key]" clearable :placeholder="(field.hint || '') + '…'" />
              <template #help>
                <span v-if="field.key === 'fromAddress' && smtpFromMismatch" class="help-warning">{{ smtpFromMismatch.message }}</span>
                <span v-else>{{ field.hint || '' }}</span>
              </template>
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
              <template #help>{{ credentialHint(key) }}</template>
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
      <template #footer>
        <div class="dialog-footer">
          <t-button theme="default" @click="formVisible = false">取消</t-button>
          <t-button theme="primary" variant="outline" :loading="saving" @click="onSave(true)">保存并测试连通</t-button>
          <t-button theme="primary" :loading="saving" @click="onSave()">保存</t-button>
        </div>
      </template>
    </t-dialog>

    <t-dialog
      v-model:visible="testVisible"
      header="测试发送"
      width="560px"
      :confirm-btn="{ content: '发送', theme: 'primary', loading: testing }"
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

/* 分组改为独立卡片（page-card）：去掉原分隔线，卡片间距统一 16px */
.kind-section {
  margin-bottom: 16px;
}

.kind-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.kind-title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

.kind-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.kind-desc {
  font-size: 12px;
}
</style>
