<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { httpGet, httpPut } from '@/api/http'
import { usePageDirtyGuard } from '@/utils/form'
import { confirmDialog } from '@/utils/confirmDialog'
import ListErrorState from '@/components/ListErrorState.vue'
type FileKey = 'privateKey' | 'publicKey' | 'certificate'
interface PaymentConfig {
  ready: boolean; enabled: boolean; requested: boolean; checkedAt: string; notifyUrl: string | null
  version: number; source: string; certificateError: string
  webOAuth: { ready: boolean; reason: string; callbackUrl: string | null; clientBase: string | null }
  values: { mchid: string; appid: string; serial: string; publicKeyId: string; base: string; clientBase: string }
  secrets: { privateKey: boolean; publicKey: boolean; key: boolean; certificate: boolean; appSecret: boolean }
  fields: Array<{ key: string; state: 'configured' | 'missing' | 'invalid' }>
}
const loading = ref(false), saving = ref(false), loadError = ref(''), saveError = ref(''), config = ref<PaymentConfig | null>(null)
const form = reactive({ enabled: false, mchid: '', appid: '', serial: '', publicKeyId: '', base: '', key: '', privateKey: '', publicKey: '', certificate: '', appSecret: '', clientBase: '' })
const filenames = reactive({ privateKey: '', publicKey: '', certificate: '' })
const baseline = ref('')
const uploading = ref(0)
const fileVersions = { privateKey: 0, publicKey: 0, certificate: 0 }
const isDirty = computed(() => !!baseline.value && JSON.stringify(form) !== baseline.value)
usePageDirtyGuard(isDirty)
const fields = [
  { key: 'mchid', code: 'WXPAY_MCHID', label: '收款商户号', tip: '商户平台 → 账户中心 → 商户信息，填写客户自己的纯数字商户号。' },
  { key: 'appid', code: 'WXPAY_APPID', label: '应用 AppID', tip: '从公众平台开发设置或开放平台应用详情获取，填写 wx 开头的 AppID；须与商户号完成授权绑定。' },
  { key: 'serial', code: 'WXPAY_CERT_SERIAL', label: '商户 API 证书序列号', tip: '填写商户 API 证书的十六进制序列号。也可上传商户证书并留空，由系统提取。' },
  { key: 'publicKeyId', code: 'WXPAY_PUBLIC_KEY_ID', label: '微信支付公钥 ID', tip: '商户平台 → 账户中心 → API 安全 → 管理公钥，填写 PUB_KEY_ID_ 开头的完整 ID，与下方微信支付公钥配套。' },
  { key: 'base', code: 'WXPAY_NOTIFY_BASE_URL', label: '支付通知域名', tip: '填写外网可访问的 HTTPS 后端源站，如 https://api.example.com；不加 /api 路径、后台页面或 /#/ 路由。' },
  { key: 'clientBase', code: 'WXPAY_CLIENT_BASE_URL', label: '客户端站点地址', tip: '填写客户端 HTTPS 源站，如 https://app.example.com；仅用于微信网页授权与 H5 支付完成后回跳收银台，须与通知域名分别配置。' },
] as const
const fileFields: Array<{ key: FileKey; label: string; tip: string }> = [
  { key: 'certificate', label: '商户 API 证书（可选）', tip: '上传 apiclient_cert.pem；用于提取序列号、检查证书期限及与私钥的配套关系。' },
  { key: 'privateKey', label: '商户私钥（必需）', tip: '上传 apiclient_key.pem，须为 RSA 2048 位私钥，用于请求签名。' },
  { key: 'publicKey', label: '微信支付公钥（必需）', tip: '上传商户平台下载的微信支付公钥 PEM，须为 RSA 2048 位公钥，用于验证微信应答和通知签名。' },
]
const stateLabels = { configured: '本地检查通过', missing: '未配置', invalid: '需修正' } as const
function state(code: string) { return config.value?.fields.find(f => f.key === code)?.state }
function apply(value: PaymentConfig) {
  config.value = value
  Object.assign(form, value.values, { enabled: value.requested, key: '', appSecret: '', privateKey: '', publicKey: '', certificate: '' })
  Object.assign(filenames, { privateKey: '', publicKey: '', certificate: '' })
  baseline.value = JSON.stringify(form)
}
async function load() {
  if (loading.value || saving.value) return
  loading.value = true; loadError.value = ''
  try { apply(await httpGet<PaymentConfig>('/system/payment-config')) }
  catch (e) { loadError.value = e instanceof Error ? e.message : '配置加载失败' }
  finally { loading.value = false }
}
function reload() {
  if (!isDirty.value) { void load(); return }
  const dialog = confirmDialog({ header: '放弃未保存的配置？', body: '重新读取会清除尚未保存的输入和待上传文件。', confirmBtn: '放弃并重新读取', onConfirm: () => { dialog.destroy(); void load() }, onCancel: () => dialog.destroy() })
}
async function upload(key: FileKey, event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file || saving.value) return
  const version = ++fileVersions[key]
  uploading.value++
  saveError.value = ''
  try {
    if (file.size > 32768 || !/\.(pem|crt)$/i.test(file.name)) throw new Error('请选择不超过 32 KB 的 PEM / CRT 文件')
    const text = await file.text()
    const expected = key === 'privateKey' ? /-----BEGIN (RSA )?PRIVATE KEY-----/ : key === 'publicKey' ? /-----BEGIN PUBLIC KEY-----/ : /-----BEGIN CERTIFICATE-----/
    if (!expected.test(text)) throw new Error('文件类型与所选参数不符，请核对商户证书、商户私钥和微信支付公钥')
    if (version === fileVersions[key]) { form[key] = text; filenames[key] = file.name }
  } catch (e) { saveError.value = e instanceof Error ? e.message : '文件读取失败' }
  finally { input.value = ''; uploading.value-- }
}
function cancelUpload(key: FileKey) { form[key] = ''; filenames[key] = '' }
async function save() {
  if (saving.value || uploading.value || !config.value || !isDirty.value) return
  saving.value = true; saveError.value = ''
  try {
    apply(await httpPut<PaymentConfig>('/system/payment-config/wechat', { ...form, version: config.value.version }))
    MessagePlugin.success('微信收款配置已保存并生效')
  } catch (e) { saveError.value = e instanceof Error ? e.message : '配置保存失败' }
  finally { saving.value = false }
}
onMounted(load)
</script>
<template>
  <div class="payment-config">
    <t-card title="微信收款配置" :bordered="false">
      <template #actions><t-button variant="outline" :disabled="saving || uploading > 0" :loading="loading" @click="reload">重新读取配置</t-button></template>
      <p class="intro">客户自营普通商户 · APIv3 · 微信支付公钥验签。商户参数可在本页填写、上传并保存，无需填写服务器文件路径。</p>
      <t-alert theme="info" title="密钥只写，文件随保存一并提交" message="密钥和文件加密保存，不回显原文，也不进入公开素材库。已配置密钥留空、文件不重新上传即保留原值；只选择文件不会立即替换生效。" />
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
      <template v-if="config && !loadError">
        <t-alert class="notice" :theme="config.enabled ? 'success' : 'warning'" :title="config.enabled ? '已允许发起微信收款' : '尚未允许发起微信收款'">
          <template #message><p>{{ config.ready ? '已保存参数通过本地格式与文件检查。' : '请补齐下方参数；可先关闭收款并保存未完成的配置。' }}</p><p>本地检查不请求微信，不等于产品权限、商户绑定、公网通知或真实交易联调通过。完成联调验收后再开启收款。</p></template>
        </t-alert>
        <p class="meta">当前来源：{{ config.source === 'database' ? '后台保存的配置' : '部署环境（首次保存后改用后台配置）' }} · 最近检查 {{ new Date(config.checkedAt).toLocaleString('zh-CN') }}</p>
        <t-form :data="form" label-align="top" class="payment-form" @submit="save">
          <div class="field-grid">
            <t-form-item v-for="field in fields" :key="field.key" :label="field.label" :name="field.key" :help="field.tip">
              <div class="field-control"><t-input v-accessible-field v-model="form[field.key]" :disabled="saving || uploading > 0" autocomplete="off" :placeholder="'请输入' + field.label + '…'" /><span class="state">{{ state(field.code) ? stateLabels[state(field.code)!] : '' }}</span></div>
            </t-form-item>
            <t-form-item label="APIv3 密钥（必需）" name="key" help="商户平台 → API 安全 → 设置 APIv3 密钥。32 位数字及大小写字母组合，用于通知解密；已配置时留空保留。">
              <div class="field-control"><t-input v-accessible-field v-model="form.key" :disabled="saving || uploading > 0" type="password" autocomplete="new-password" :maxlength="32" :placeholder="config.secrets.key ? '已配置，填写以替换…' : '请输入 32 位 APIv3 密钥…'" /><span class="state">{{ config.secrets.key ? '已配置' : '未配置' }}</span></div>
            </t-form-item>
            <t-form-item label="公众号 AppSecret（JSAPI 网页授权）" name="appSecret" help="公众平台 → 开发设置 → AppSecret。仅用于微信网页授权换取 OpenID，不参与支付签名；留空保留原值。未配置时微信内网页无法发起 JSAPI 支付。">
              <div class="field-control"><t-input v-accessible-field v-model="form.appSecret" :disabled="saving || uploading > 0" type="password" autocomplete="new-password" :maxlength="64" :placeholder="config.secrets.appSecret ? '已配置，填写以替换…' : '请输入公众号 AppSecret…'" /><span class="state">{{ config.secrets.appSecret ? '已配置' : '未配置' }}</span></div>
            </t-form-item>
          </div>
          <div class="upload-grid">
            <section v-for="file in fileFields" :key="file.key" class="upload-field">
              <h3>{{ file.label }}</h3><p>{{ file.tip }}</p>
              <label class="file-picker">{{ form[file.key] ? '重新选择文件' : config.secrets[file.key] ? '上传替换文件' : '选择文件' }}<input type="file" accept=".pem,.crt" :aria-label="'上传' + file.label" :disabled="saving || uploading > 0" @change="upload(file.key, $event)" /></label>
              <p class="state">{{ filenames[file.key] ? '待保存：' + filenames[file.key] : config.secrets[file.key] ? '已配置；不重新上传则保留' : '尚未上传' }}</p>
              <t-button v-if="form[file.key]" variant="text" size="small" :disabled="saving || uploading > 0" @click="cancelUpload(file.key)">取消本次替换</t-button>
            </section>
          </div>
          <t-form-item label="允许发起微信收款" name="enabled" help="请先完成产品权限、绑定、通知、查单、退款及对账验收。关闭后仍保留存量通知、查询和退款；已生成的收款码不会自动失效。">
            <t-switch v-accessible-field="'允许发起微信收款'" v-model="form.enabled" :disabled="saving || uploading > 0" />
          </t-form-item>
          <t-alert v-if="saveError" role="alert" theme="error" :message="saveError" />
          <div class="save-bar"><span>{{ isDirty ? '有未保存的修改' : '配置已与服务器同步' }}</span><t-button :loading="saving" :disabled="loading || uploading > 0 || !isDirty" @click="save">保存微信配置</t-button></div>
        </t-form>
        <t-alert class="notice" :theme="config.webOAuth.ready ? 'success' : 'warning'" title="微信内网页支付（JSAPI）">
          <template #message><p>{{ config.webOAuth.ready ? '网页授权参数已齐备，客户端在微信内可发起 JSAPI 支付。' : config.webOAuth.reason || '补齐公众号 AppSecret 与客户端站点地址后，微信内网页才能发起支付。' }}</p><p>授权回跳地址：{{ config.webOAuth.callbackUrl ?? '待配置' }}；微信外手机浏览器使用 H5 支付，PC 使用扫码支付，均不受此开关影响。</p></template>
        </t-alert>
        <t-alert class="notice" theme="info" title="完整支付通知地址"><template #message><p>{{ config.notifyUrl ?? '保存有效通知域名后显示。' }}</p><p>通知需直达后端，网关保留原始请求体与微信签名请求头。有待确认支付或退款时暂不能替换参数，可单独关闭收款开关。</p></template></t-alert>
      </template>
    </t-card>
    <t-card title="配置与启用提示" :bordered="false">
      <ol class="steps"><li>商户管理员开通支付产品，完成 AppID 与商户号授权绑定。</li><li>填写参数、上传私钥和微信支付公钥后保存。商户证书可辅助提取序列号并检查私钥是否配套。</li><li>验证公网通知、下单、查单、重复通知、超时关单、退款及对账，验收通过后开启收款。</li></ol>
      <p>已交付后台 Native 收款码；JSAPI/H5 仍需客户端收银台与网页授权。保存配置不会自动启用客户端支付、发券、报名或预约。</p>
      <p>请同时备份数据库和后端私有目录内的支付配置加密主密钥；多实例需使用同一主密钥。主密钥由服务器管理，无需在本页上传。</p>
      <t-space break-line><a href="https://pay.weixin.qq.com/doc/v3/merchant/4013070756" target="_blank" rel="noopener noreferrer">官方参数说明</a><a href="https://pay.weixin.qq.com/doc/v3/merchant/4012072195" target="_blank" rel="noopener noreferrer">APIv3 密钥配置</a></t-space>
    </t-card>
  </div>
</template>
<style scoped>
.payment-config { display: grid; gap: 16px; min-width: 0; }
.intro, .meta, .state { color: var(--td-text-color-secondary); line-height: 1.7; }
.intro { margin: 0 0 16px; }
.meta, .state { font-size: 12px; }
.notice { margin-top: 16px; }
.payment-form { margin-top: 24px; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; }
.field-control { width: 100%; }
.upload-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
.upload-field { min-width: 0; padding: 16px; border: 1px solid var(--td-component-border); border-radius: var(--td-radius-default); }
h3 { margin: 0 0 8px; font-size: 14px; }
p { margin: 8px 0; line-height: 1.7; overflow-wrap: anywhere; }
.file-picker { display: inline-block; position: relative; overflow: hidden; padding: 6px 12px; border: 1px solid var(--td-component-border); border-radius: var(--td-radius-default); cursor: pointer; }
.file-picker input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.file-picker:focus-within { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
.save-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 0; color: var(--td-text-color-secondary); }
.steps { padding-left: 24px; line-height: 1.9; }
a { color: var(--td-brand-color); }
@media (max-width: 900px) { .field-grid, .upload-grid { grid-template-columns: 1fr; } }
</style>
