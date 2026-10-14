<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { fetchLicense, importLicense, requestLicense, type LicenseInfo } from '@/api/license'

const emit = defineEmits<{ writable: [value: boolean] }>()
const info = ref<LicenseInfo | null>(null)
const loading = ref(false)
const generating = ref(false)
const importing = ref(false)
const error = ref('')
const customerName = ref('')
const fileInput = ref<HTMLInputElement>()
let timer: ReturnType<typeof setInterval> | undefined
let loadVersion = 0
function apply(value: LicenseInfo) {
  info.value = value
  emit('writable', value.status === 'valid')
}
async function loadLicense(silent = false) {
  const version = ++loadVersion
  if (!silent) loading.value = true
  try {
    const result = await fetchLicense()
    if (version !== loadVersion) return
    apply(result)
    error.value = ''
  } catch (e) {
    if (version !== loadVersion) return
    error.value = e instanceof Error ? e.message : '授权信息加载失败'
    emit('writable', false)
  } finally { loading.value = false }
}
function date(value: string | null | undefined, empty = '—') {
  return value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : empty
}
async function generate() {
  if (!customerName.value.trim()) { MessagePlugin.warning('请填写客户名称'); return }
  generating.value = true
  try {
    const data = await requestLicense(customerName.value.trim())
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `license-request-${data.deploymentId}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    MessagePlugin.success('授权申请文件已生成，请发送给软件供应商')
  } catch (e) { MessagePlugin.error(e instanceof Error ? e.message : '申请文件生成失败') }
  finally { generating.value = false }
}
async function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  ++loadVersion // Ignore a status request started before this import.
  importing.value = true
  try {
    if (file.size > 32768) throw new Error('许可证文件不能超过 32 KB')
    apply(await importLicense(await file.text()))
    error.value = ''
    MessagePlugin.success('许可证导入成功，授权已生效')
  } catch (e) { MessagePlugin.error(e instanceof Error ? e.message : '许可证导入失败') }
  finally { importing.value = false; input.value = '' }
}
onMounted(() => { void loadLicense(); timer = setInterval(() => { if (!importing.value) void loadLicense(true) }, 30000) })
onUnmounted(() => { clearInterval(timer); ++loadVersion })
</script>

<template>
  <t-card title="许可证管理" :bordered="true" class="license-card">
    <ListErrorState v-if="error" :message="error" :loading="loading" @retry="loadLicense()" />
    <t-loading :loading="loading" size="small">
      <template v-if="info">
        <div class="license-state" aria-live="polite">
          <StatusTag entity="license" :value="info.status" />
          <span>{{ info.reason }}</span>
        </div>
        <t-alert v-if="info.status !== 'valid'" theme="warning" class="license-notice"
          message="当前不允许业务写入，仍可查询、导出、备份和导入许可证。导入有效许可证后自动恢复。" />
        <dl class="license-details">
          <div><dt>客户名称</dt><dd>{{ info.license?.customerName || '—' }}</dd></div>
          <div><dt>客户编号</dt><dd>{{ info.license?.customerId || '—' }}</dd></div>
          <div><dt>许可证编号</dt><dd>{{ info.license?.licenseId || '—' }}</dd></div>
          <div><dt>部署标识</dt><dd>{{ info.deploymentId }}</dd></div>
          <div><dt>生效时间</dt><dd>{{ date(info.license?.notBefore) }}</dd></div>
          <div><dt>授权截止时间</dt><dd>{{ info.license ? date(info.license.expiresAt, '永久有效') : '—' }}</dd></div>
          <div><dt>签发时间</dt><dd>{{ date(info.license?.issuedAt) }}</dd></div>
          <div><dt>最近导入时间</dt><dd>{{ date(info.importedAt) }}</dd></div>
          <div><dt>服务器时间（北京时间）</dt><dd>{{ date(info.serverTime) }}</dd></div>
        </dl>
      </template>
      <div class="license-actions">
        <label for="license-customer">申请授权的客户名称</label>
        <t-input id="license-customer" v-model="customerName" :maxlength="200" placeholder="填写客户或单位全称…" />
        <t-space break-line>
          <t-button variant="outline" :loading="generating" :disabled="loading || importing || !customerName.trim()" @click="generate">生成授权申请文件</t-button>
          <t-button theme="primary" :loading="importing" :disabled="loading || generating" @click="fileInput?.click()">导入许可证文件</t-button>
        </t-space>
        <input ref="fileInput" type="file" accept=".json,.license,application/json" hidden aria-label="选择许可证文件" @change="selectFile" />
        <p class="license-help">将申请文件发送给软件供应商，再导入收到的许可证文件（不超过 32 KB）。续期使用同一入口，无需重新部署；导入失败保留原许可证。</p>
      </div>
    </t-loading>
  </t-card>
</template>

<style scoped>
.license-card { margin-bottom: var(--td-comp-margin-xl); }
.license-state { display: flex; align-items: center; flex-wrap: wrap; gap: var(--td-comp-margin-s); }
.license-notice { margin-top: var(--td-comp-margin-l); }
.license-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--td-comp-margin-l); margin-block: var(--td-comp-margin-xl); }
.license-details dt, .license-help { color: var(--td-text-color-secondary); }
.license-details dd { margin: var(--td-comp-margin-xs) 0 0; overflow-wrap: anywhere; }
.license-actions { display: grid; gap: var(--td-comp-margin-m); max-width: 640px; }
.license-help { margin: 0; font-size: var(--td-font-size-body-small); }
</style>
