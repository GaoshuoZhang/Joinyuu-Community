<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { FilePdfFilledIcon, UploadIcon } from 'tdesign-icons-vue-next'
import { deleteLeaseContract, fetchLeaseContracts, uploadLeaseContract } from '@/api/workstations'
import { deleteProjectContract, fetchProjectContracts, uploadProjectContract } from '@/api/projects'

/** 合同附件（图片 / PDF 扫描件）统一形状：租约合同与项目合同结构一致 */
interface ContractFile {
  id: string
  url: string
  fileName: string
  mime: string
  size: number
  createdAt: string
}

type ContractApi = {
  list: (id: string) => Promise<ContractFile[]>
  upload: (id: string, file: File) => Promise<ContractFile>
  remove: (id: string, assetId: string) => Promise<{ code: number }>
}

/* 合同附件面板（租赁详情 / 项目详情共用，复用素材库存储管道）：
 * - resource=lease → 租约合同；resource=project → 项目合同
 * - archived=true 时只读（隐藏上传/删除，保留查看历史合同）
 * - 面板顶部保留 16px，使「上传合同」按钮与选项卡导航分割线之间保持间距 */
const props = withDefaults(
  defineProps<{
    entityId: string
    resource: 'lease' | 'project'
    archived?: boolean
    tip?: string
  }>(),
  {
    archived: false,
    tip: '线下签约的纸质合同可上传照片或 PDF 扫描件（支持 PNG/JPEG/GIF/WebP 与 PDF，单文件大小受系统配置限制）',
  },
)

const api = computed<ContractApi>(() =>
  props.resource === 'lease'
    ? { list: fetchLeaseContracts, upload: uploadLeaseContract, remove: deleteLeaseContract }
    : { list: fetchProjectContracts, upload: uploadProjectContract, remove: deleteProjectContract },
)

const contracts = ref<ContractFile[]>([])
const loading = ref(false)
const error = ref('')
const uploading = ref(false)
const removingId = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function isImage(c: ContractFile): boolean {
  return c.mime.startsWith('image/')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function load() {
  const id = props.entityId
  if (!id) {
    contracts.value = []
    return
  }
  loading.value = true
  error.value = ''
  try {
    contracts.value = await api.value.list(id)
  } catch (e) {
    contracts.value = []
    error.value = e instanceof Error ? e.message : '合同附件加载失败'
  } finally {
    loading.value = false
  }
}

function pickFile() {
  fileInput.value?.click()
}

/* 支持一次选多个文件：逐个上传，任一失败即中断并提示（已成功的保留） */
async function onPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  /* 清空 value：同一文件重复选择也触发 change */
  input.value = ''
  if (!files.length || !props.entityId) return
  uploading.value = true
  try {
    for (const file of files) {
      await api.value.upload(props.entityId, file)
    }
    MessagePlugin.success(files.length > 1 ? `已上传 ${files.length} 个合同文件` : '合同附件已上传')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '合同上传失败')
  } finally {
    uploading.value = false
    await load()
  }
}

async function onRemove(item: ContractFile) {
  if (!props.entityId) return
  removingId.value = item.id
  try {
    await api.value.remove(props.entityId, item.id)
    MessagePlugin.success('合同附件已删除')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    removingId.value = ''
  }
}

onMounted(load)
watch(() => props.entityId, () => void load())
</script>

<template>
  <div class="contract-panel">
    <div class="contract-head">
      <div class="contract-tip">{{ tip }}</div>
      <t-button v-if="!archived" theme="primary" :loading="uploading" @click="pickFile">
        <template #icon><UploadIcon /></template>
        上传合同
      </t-button>
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
        multiple
        class="hidden-file"
        @change="onPicked"
      />
    </div>

    <t-loading :loading="loading">
      <div v-if="error" class="contract-error">
        <span>{{ error }}</span>
        <t-button variant="text" size="small" @click="load">重试</t-button>
      </div>
      <t-empty v-else-if="!contracts.length" description="暂无合同附件" />
      <div v-else class="contract-grid">
        <div v-for="c in contracts" :key="c.id" class="contract-card">
          <a class="contract-preview" :href="c.url" target="_blank" rel="noopener" :title="`查看 ${c.fileName}`">
            <img v-if="isImage(c)" :src="c.url" :alt="c.fileName" class="contract-thumb" />
            <span v-else class="contract-doc"><FilePdfFilledIcon />PDF</span>
          </a>
          <div class="contract-meta">
            <div class="contract-name" :title="c.fileName">{{ c.fileName }}</div>
            <div class="cell-sub">{{ formatSize(c.size) }} · {{ c.createdAt }}</div>
          </div>
          <div class="contract-ops">
            <t-link theme="primary" hover="color" :href="c.url" target="_blank" rel="noopener">查看</t-link>
            <t-popconfirm
              v-if="!archived"
              :content="`确认删除合同附件「${c.fileName}」？删除后不可恢复`"
              :confirm-btn="{ content: '删除', theme: 'danger' }"
              @confirm="onRemove(c)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="removingId === c.id">删除</t-button>
            </t-popconfirm>
          </div>
        </div>
      </div>
    </t-loading>
  </div>
</template>

<style scoped>
/* 与选项卡导航分割线之间留白：按钮/提示不与其粘连 */
.contract-panel {
  padding-top: 16px;
}

.contract-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.contract-tip {
  flex: 1;
  font-size: 12px;
  line-height: 20px;
  color: var(--td-text-color-secondary);
}

.hidden-file {
  display: none;
}

.contract-error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--td-error-color);
}

.contract-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.contract-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.contract-preview {
  display: block;
  height: 120px;
  overflow: hidden;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-small);
}

.contract-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.contract-doc {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 100%;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.contract-doc svg {
  font-size: 28px;
}

.contract-meta {
  min-width: 0;
}

.contract-name {
  font-size: 12px;
  line-height: 20px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contract-ops {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
