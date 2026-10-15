<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { fetchLicense } from '@/api/license'
import { activateMobileTheme, fetchMobileThemes, previewMobileTheme, resetMobileTheme, rollbackMobileTheme, uploadMobileTheme, type MobileThemeList } from '@/api/mobileThemes'

const data = ref<MobileThemeList>({ activeId: null, previousId: null, schemaVersion: 1, packages: [] })
const loading = ref(true)
const busy = ref(false)
const loadError = ref('')
const actionError = ref('')
const writable = ref(false)
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement>()
const previewUrl = ref('')
const previewExpires = ref('')
const mobileUrl = ref(import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:7759/` : `${window.location.origin}/`)
const active = computed(() => data.value.packages.find((item) => item.id === data.value.activeId))
const previous = computed(() => data.value.packages.find((item) => item.id === data.value.previousId))
function message(e: unknown) { return e instanceof Error ? e.message : '操作失败，请稍后重试' }
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [themes, license] = await Promise.all([fetchMobileThemes(), fetchLicense()])
    data.value = themes
    writable.value = license.status === 'valid'
  } catch (e) { loadError.value = message(e) }
  finally { loading.value = false }
}
onMounted(load)
function selectFile(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0] ?? null
  if (selected && (!selected.name.toLowerCase().endsWith('.zip') || selected.size > 10 * 1024 * 1024)) {
    MessagePlugin.error('请选择不超过 10 MB 的 ZIP 文件')
    if (fileInput.value) fileInput.value.value = ''
    file.value = null
    return
  }
  file.value = selected
}
async function upload() {
  if (!file.value) return
  actionError.value = ''
  busy.value = true
  try {
    await uploadMobileTheme(file.value)
    file.value = null
    if (fileInput.value) fileInput.value.value = ''
    MessagePlugin.success('主题包已上传，预览确认后即可启用')
    await load()
  } catch (e) { actionError.value = message(e); MessagePlugin.error(actionError.value) }
  finally { busy.value = false }
}
function confirmChange(title: string, action: () => Promise<unknown>) {
  const dialog = DialogPlugin.confirm({ header: title, body: '切换后，移动端用户重新打开或刷新页面即可使用新主题。', confirmBtn: '确认切换', onConfirm: async () => {
    dialog.hide()
    actionError.value = ''
    busy.value = true
    try { await action(); MessagePlugin.success('移动端主题已切换'); await load() }
    catch (e) { actionError.value = message(e); MessagePlugin.error(actionError.value) }
    finally { busy.value = false }
  } })
}
async function preview(id: string) {
  let target: URL
  try {
    target = new URL(mobileUrl.value)
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash) throw new Error()
  } catch { MessagePlugin.error('请输入有效的移动端 HTTP/HTTPS 地址，不包含 # 或账号密码'); return }
  actionError.value = ''
  busy.value = true
  previewUrl.value = ''
  try {
    const grant = await previewMobileTheme(id)
    target.searchParams.set('themePreview', grant.token)
    previewUrl.value = target.href
    previewExpires.value = new Date(grant.expiresAt).toLocaleString('zh-CN')
  } catch (e) { actionError.value = message(e); MessagePlugin.error(actionError.value) }
  finally { busy.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="移动端主题" description="上传客户主题包，预览后启用；切回公版可恢复默认外观。" />
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <t-alert v-if="actionError" theme="error" title="操作未完成" :message="actionError" close @close="actionError = ''" />
    <t-loading :loading="loading">
      <div class="theme-sections">
        <t-alert v-if="!loading && !writable" theme="warning" message="当前许可证不可写，请先在系统配置中完成授权，再上传或切换主题。" />
        <t-card title="当前主题" :bordered="false">
          <p class="current-name">{{ active ? `${active.manifest.name} · ${active.manifest.version}` : '公版主题' }}</p>
          <p class="theme-note">{{ active?.manifest.description || '使用公版业务功能和页面，主题只调整移动端外观与首页布局。' }}</p>
          <t-space break-line>
            <t-button variant="outline" :disabled="busy || loading || !writable || !data.activeId" @click="confirmChange('恢复公版主题', resetMobileTheme)">恢复公版</t-button>
            <t-button variant="outline" :disabled="busy || loading || !writable || data.activeId === data.previousId" @click="confirmChange(`回退至${previous?.manifest.name || '公版主题'}`, rollbackMobileTheme)">回退上一主题</t-button>
          </t-space>
        </t-card>
        <t-card title="上传主题包" :bordered="false">
          <p id="theme-file-help" class="theme-note">支持主题协议 v1，ZIP 最大 10 MB。包内包含 manifest.json 和 PNG、JPEG、WebP 图片；上传后不会自动启用。</p>
          <div class="theme-upload">
            <label for="theme-file">主题包文件</label>
            <input id="theme-file" ref="fileInput" type="file" accept=".zip,application/zip" aria-describedby="theme-file-help" :disabled="busy || loading || !writable" @change="selectFile" />
            <t-button :loading="busy" :disabled="!file || loading || !writable" @click="upload">上传主题包</t-button>
          </div>
        </t-card>
        <t-card title="已上传主题" :bordered="false">
          <label for="theme-mobile-url">移动端访问地址</label>
          <t-input id="theme-mobile-url" v-accessible-field v-model="mobileUrl" type="url" placeholder="请输入移动端完整访问地址…" :disabled="busy" />
          <p class="theme-note">填写实际移动端入口，用于生成有效期 15 分钟的预览链接。预览只影响打开链接的浏览器窗口。</p>
          <div v-if="previewUrl" class="theme-preview" role="status">
            <a :href="previewUrl" target="_blank" rel="noopener noreferrer">打开移动端预览</a>
            <span class="theme-note">有效期至 {{ previewExpires }}，请勿转发预览链接。</span>
          </div>
          <t-empty v-if="!loading && !data.packages.length" description="暂无主题包，当前使用公版主题" />
          <ul v-else class="theme-packages">
            <li v-for="item in data.packages" :key="item.id" class="theme-package">
              <div class="theme-package-info">
                <strong>{{ item.manifest.name }}</strong>
                <span>{{ item.manifest.version }} · {{ item.manifest.id }}</span>
                <span v-if="item.id === data.activeId">当前使用</span>
                <p v-if="item.manifest.description" class="theme-note">{{ item.manifest.description }}</p>
                <p class="theme-note">{{ new Date(item.createdAt).toLocaleString('zh-CN') }} · {{ item.createdBy }}</p>
              </div>
              <t-space>
                <t-button variant="outline" :disabled="busy || !writable" @click="preview(item.id)">预览</t-button>
                <t-button :disabled="busy || !writable || item.id === data.activeId" @click="confirmChange(`启用「${item.manifest.name}」`, () => activateMobileTheme(item.id))">启用</t-button>
              </t-space>
            </li>
          </ul>
        </t-card>
      </div>
    </t-loading>
  </div>
</template>

<style scoped>
.theme-sections { display: grid; gap: var(--td-comp-margin-l); }
.current-name { margin-top: 0; font: var(--td-font-title-medium); }
.theme-note { color: var(--td-text-color-secondary); overflow-wrap: anywhere; }
.theme-upload, .theme-preview { display: flex; align-items: center; flex-wrap: wrap; gap: var(--td-comp-margin-m); }
.theme-upload input { max-width: 100%; }
.theme-packages { list-style: none; padding: 0; margin-bottom: 0; }
.theme-package { display: flex; align-items: center; justify-content: space-between; gap: var(--td-comp-margin-l); padding: var(--td-comp-paddingTB-l) 0; border-top: 1px solid var(--td-component-stroke); }
.theme-package-info { min-width: 0; overflow-wrap: anywhere; }
.theme-package-info > span { margin-left: var(--td-comp-margin-s); }
@media (max-width: 640px) { .theme-package { flex-direction: column; align-items: flex-start; } }
</style>
