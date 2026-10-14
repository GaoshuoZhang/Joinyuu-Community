<script setup lang="ts">
import { useListQueryState } from '@/utils/listQuery'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { DeleteIcon, UploadIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { deleteAsset, fetchAssets, replaceAsset, uploadAsset, type MallAsset } from '@/api/assets'

/* 素材库：上传/网格列表/来源筛选/替换/删除/复制 URL（真实接口 /api/admin/assets）。 */
const loading = ref(false)
const loadError = ref('')
const uploading = ref(false)
const assets = ref<MallAsset[]>([])
const activeSource = ref('')
const search = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const replaceInput = ref<HTMLInputElement | null>(null)
const replacingId = ref('')

const sourceOptions = [
  { label: '全部来源', value: '' },
  { label: '资讯发布', value: 'article' },
  { label: '投稿内容', value: 'submission' },
  { label: '租赁合同', value: 'lease' },
  { label: '未关联', value: 'none' },
]

/** 来源标签：资讯发布-A1010 / 投稿内容-SU1006 / 租赁合同-LS1001 / 未关联 */
function sourceText(a: MallAsset): string {
  if (a.sourceId && a.sourceType === 'article') return `资讯发布-${a.sourceId}`
  if (a.sourceId && a.sourceType === 'submission') return `投稿内容-${a.sourceId}`
  if (a.sourceId && a.sourceType === 'lease') return `租赁合同-${a.sourceId}`
  return '未关联'
}

/** 来源标签语义色：未关联用中性色，已关联按业务来源区分 */
function sourceTheme(a: MallAsset): 'default' | 'primary' | 'success' | 'warning' {
  if (!a.sourceId) return 'default'
  if (a.sourceType === 'article') return 'primary'
  return a.sourceType === 'lease' ? 'warning' : 'success'
}

/** 字节大小自适应展示（B/KB/MB）：单卡与汇总共用 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const filtered = computed(() =>
  assets.value.filter(
    (a) =>
      (!activeSource.value || (activeSource.value === 'none' ? !a.sourceId : a.sourceType === activeSource.value)) &&
      (!search.value || a.fileName.toLowerCase().includes(search.value.toLowerCase())),
  ),
)

/* 汇总口径与列表一致：数量与体积都按当前筛选结果统计 */
const totalSize = computed(() => formatSize(filtered.value.reduce((s, a) => s + a.size, 0)))

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    assets.value = await fetchAssets()
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

function triggerUpload() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploading.value = true
  try {
    await uploadAsset(file, 'general')
    MessagePlugin.success(`「${file.name}」上传成功`)
    await load(true)
  } catch (err) {
    MessagePlugin.error(err instanceof Error ? err.message : '上传失败')
  } finally {
    uploading.value = false
  }
}

/** 复制文本：优先 Clipboard API（HTTPS/localhost）；非安全上下文（局域网 IP）回退 execCommand */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 权限拒绝/非安全上下文 → 走回退 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

async function onCopy(row: MallAsset) {
  const url = new URL(row.url, window.location.origin).toString()
  const ok = await copyText(url)
  if (ok) MessagePlugin.success('URL 已复制到剪贴板')
  else MessagePlugin.error('复制失败，请手动复制')
}

/** 替换素材：覆盖原存储内容（URL 不变），引用它的文章/页面即时生效 */
function triggerReplace(row: MallAsset) {
  replacingId.value = row.id
  replaceInput.value?.click()
}

async function onReplaceFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !replacingId.value) return
  uploading.value = true
  try {
    await replaceAsset(replacingId.value, file)
    MessagePlugin.success(`已替换「${file.name}」，引用该素材的页面即时生效`)
    await load(true)
  } catch (err) {
    MessagePlugin.error(err instanceof Error ? err.message : '替换失败')
  } finally {
    uploading.value = false
    replacingId.value = ''
  }
}

async function onDelete(row: MallAsset) {
  try {
    await deleteAsset(row.id)
    MessagePlugin.success('素材已删除')
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  }
}

useListQueryState({}, undefined, { refs: { source: activeSource, keyword: search }, live: true })

/* 空态筛选判定：来源/关键字任一生效即视为筛选无结果 */
const filterState = computed(() => ({ source: activeSource.value, keyword: search.value }))

function onClearFilters() {
  activeSource.value = ''
  search.value = ''
}

onMounted(load)
</script>

<template>
  <div class="asset-library page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="素材库" description="集中管理上传的图片素材，供商品、活动、文章等业务场景引用">
      <template #actions>
        <input ref="fileInput" type="file" accept="image/*" class="hidden-file" @change="onFileChange" />
        <input ref="replaceInput" type="file" accept="image/*" class="hidden-file" @change="onReplaceFileChange" />
        <t-button theme="primary" :loading="uploading" @click="triggerUpload">
          <template #icon><UploadIcon /></template>
          上传图片
        </t-button>
      </template>
    </PageHeader>

    <!-- 计数为 0 时隐藏摘要：避免与下方空态「暂无素材」重复冗余 -->
    <p v-if="filtered.length" class="asset-summary">{{ filtered.length }} 个素材 · 共 {{ totalSize }}</p>

    <div class="page-filter-bar">
      <t-select class="ctl-w-sm" v-model="activeSource" :options="sourceOptions" />
      <t-input class="ctl-w-xl" v-model="search" clearable placeholder="按文件名搜索…" />
    </div>

    <t-loading :loading="loading" size="small" class="asset-grid">
      <ListEmptyState
        v-if="!loading && !filtered.length"
        class="asset-empty"
        :query="filterState"
        description="暂无素材，点击右上角「上传图片」新增"
        @clear="onClearFilters"
      />
      <div v-for="a in filtered" :key="a.id" class="asset-card">
        <div class="asset-thumb-wrap">
          <img class="asset-thumb content-img" :src="a.url" :alt="a.fileName" width="320" height="180" loading="lazy" decoding="async" />
          <t-tag class="asset-badge" size="small" variant="light" :theme="sourceTheme(a)">{{ sourceText(a) }}</t-tag>
        </div>
        <div class="asset-info">
          <div class="asset-name" :title="a.fileName">{{ a.fileName }}</div>
          <div class="asset-meta">
            <span>{{ a.createdAt }}</span>
            <span>{{ formatSize(a.size) }}</span>
          </div>
        </div>
        <div class="asset-op">
          <t-button variant="text" size="small" @click="onCopy(a)">复制 URL</t-button>
          <t-button variant="text" size="small" @click="triggerReplace(a)">替换</t-button>
          <t-popconfirm content="确认删除该素材？引用它的业务图片将无法显示。" @confirm="onDelete(a)">
            <t-button variant="text" theme="danger" size="small">
              <template #icon><DeleteIcon /></template>
              删除
            </t-button>
          </t-popconfirm>
        </div>
      </div>
    </t-loading>
  </div>
</template>

<style scoped>
.hidden-file {
  display: none;
}

.asset-summary {
  margin: -8px 0 16px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  min-height: 120px;
}

.asset-empty {
  grid-column: 1 / -1;
}

.asset-card {
  overflow: hidden;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-container);
  transition: box-shadow 0.2s;
}

.asset-card:hover {
  box-shadow: var(--td-shadow-2);
}

.asset-thumb-wrap {
  position: relative;
}

.asset-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  max-width: calc(100% - 16px);
}

/* 固定 16:9 比例：卡片宽度随栅格变化时缩略图不再被拉伸变形 */
.asset-thumb {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: var(--td-bg-color-page);
}

.asset-info {
  padding: 8px 12px;
}

.asset-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 14px;
}

.asset-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.asset-op {
  display: flex;
  padding: 0 8px 8px;
}
</style>
