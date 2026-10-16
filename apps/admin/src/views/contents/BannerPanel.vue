<script setup lang="ts">
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon, EditIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { createBanner, deleteBanner, fetchBannerSettings, fetchBanners, saveBannerSettings, toggleBanner, updateBanner } from '@/api/banners'
import type { HomeBanner } from '@/types'

/* 首页轮播图管理：总开关 + 单条新增/编辑/删除/排序/启停 */
const loading = ref(false)
const loadError = ref('')
const list = ref<HomeBanner[]>([])
const acting = ref('')

/* 总开关：关闭后客户端首页不展示轮播区域 */
const carouselOpen = ref(true)
const settingsSaving = ref(false)

const columns = [
  { colKey: 'sort', title: '排序', width: 80 },
  { colKey: 'title', title: '轮播内容', cell: 'title', width: 260, ellipsis: true },
  { colKey: 'imageUrl', title: '图片', cell: 'imageUrl', width: 110 },
  { colKey: 'link', title: '跳转', cell: 'link', width: 200, ellipsis: true },
  { colKey: 'enabled', title: '展示', cell: 'enabled', width: 90 },
  { colKey: 'op', title: '操作', cell: 'op', width: 170 },
]

async function load() {
  loading.value = true
  try {
    const [rows, settings] = await Promise.all([fetchBanners(), fetchBannerSettings()])
    list.value = rows
    carouselOpen.value = settings.carouselOpen
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

/* 客户端分页：全量数据切片展示 */
const currentPage = ref(1)
const pageSize = ref(10)
const pageData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return list.value.slice(start, start + pageSize.value)
})

const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: list.value.length,
  showJumper: true,
}))

function onPageChange(p: { current: number; pageSize: number }) {
  currentPage.value = p.current
  pageSize.value = p.pageSize
}

/* 数据变少导致当前页越界时夹到合法页码 */
watch(list, () => {
  const maxPage = Math.max(1, Math.ceil(list.value.length / pageSize.value))
  if (currentPage.value > maxPage) currentPage.value = maxPage
})

async function onToggleCarousel(value: boolean) {
  settingsSaving.value = true
  try {
    await saveBannerSettings(value)
    carouselOpen.value = value
    MessagePlugin.success(value ? '首页轮播图已开启' : '首页轮播图已关闭')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
    carouselOpen.value = !value
  } finally {
    settingsSaving.value = false
  }
}

async function onToggle(row: HomeBanner) {
  acting.value = row.id
  try {
    await toggleBanner(row.id)
    MessagePlugin.success(row.enabled ? '该轮播图已停用' : '该轮播图已启用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onDelete(row: HomeBanner) {
  acting.value = row.id + ':delete'
  try {
    await deleteBanner(row.id)
    MessagePlugin.success(`轮播图「${row.title}」已删除`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    acting.value = ''
  }
}

/* 新增 / 编辑弹窗 */
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const current = ref<HomeBanner | null>(null)
const submitting = ref(false)
const formRef = ref()

const form = reactive({
  title: '',
  subtitle: '',
  imageUrl: '',
  link: '',
  sort: 1,
  enabled: true,
})

watch(dialogVisible, (visible) => {
  if (!visible) return
  if (dialogMode.value === 'edit' && current.value) {
    form.title = current.value.title
    form.subtitle = current.value.subtitle
    form.imageUrl = current.value.imageUrl ?? ''
    form.link = current.value.link ?? ''
    form.sort = current.value.sort
    form.enabled = current.value.enabled
  } else {
    form.title = ''
    form.subtitle = ''
    form.imageUrl = ''
    form.link = ''
    form.sort = Math.max(0, ...list.value.map((b) => b.sort)) + 1
    form.enabled = true
  }
  nextTick(() => formRef.value?.clearValidate())
})

/* 图片地址解析：素材库给的是相对地址（形如 /api/public/files/…），
 * 统一按当前 origin 解析为绝对地址，非法地址返回空串（表格缩略图与弹窗预览共用同一口径） */
function resolveImageUrl(url?: string): string {
  const raw = (url ?? '').trim()
  if (!raw) return ''
  try {
    return new URL(raw, window.location.origin).toString()
  } catch {
    return ''
  }
}

/* 弹窗图片即时预览：相对/绝对地址均可展示 */
const imagePreviewUrl = computed(() => resolveImageUrl(form.imageUrl))

const rules: FormProps['rules'] = {
  title: [{ required: true, message: '请输入轮播标题', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    const payload = {
      title: form.title,
      subtitle: form.subtitle,
      imageUrl: form.imageUrl.trim() || undefined,
      link: form.link.trim() || undefined,
      sort: form.sort,
      enabled: form.enabled,
    }
    if (dialogMode.value === 'create') {
      const banner = await createBanner(payload)
      MessagePlugin.success(`轮播图已新增（${banner.id}）`)
    } else if (current.value) {
      await updateBanner(current.value.id, payload)
      MessagePlugin.success('轮播图修改已保存')
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function openCreate() {
  dialogMode.value = 'create'
  current.value = null
  dialogVisible.value = true
}

function openEdit(row: HomeBanner) {
  dialogMode.value = 'edit'
  current.value = row
  dialogVisible.value = true
}

onMounted(load)
const { close: closeForm } = useDialogFormProtection(form, dialogVisible, submitting)
</script>

<template>
  <div class="banner-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="轮播图管理" description="维护客户端首页轮播图；关闭总开关后首页不展示轮播区域">
      <template #actions>
        <div class="carousel-switch">
          <span class="switch-label">首页轮播图</span>
          <!-- 总开关直接作用于客户端首页：点击仅弹确认框，确认后才切换（switch 受控于 carouselOpen，不会先自行翻转） -->
          <t-popconfirm
            :content="carouselOpen ? '确认关闭首页轮播图？关闭后客户端首页不再展示轮播区域。' : '确认开启首页轮播图？开启后客户端首页恢复展示轮播区域。'"
            @confirm="onToggleCarousel(!carouselOpen)"
          >
            <t-switch v-accessible-field="'首页轮播图总开关'" :value="carouselOpen" :loading="settingsSaving" aria-label="首页轮播图总开关" />
          </t-popconfirm>
        </div>
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增轮播图
        </t-button>
      </template>
    </PageHeader>

    <!-- 页面提示：非筛选控件，独立成行（本页无筛选控件，不占筛选条） -->
    <p class="panel-tip">轮播图按排序值升序展示，仅「展示」为开启的条目前端可见；图片留空时使用品牌渐变文字卡。</p>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="pageData"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        @page-change="onPageChange"
      >
        <template #title="{ row }">
          <div class="cell-title">{{ row.title }}</div>
          <div class="cell-sub">{{ row.subtitle || row.id }}</div>
        </template>
        <template #imageUrl="{ row }">
          <t-image
            v-if="resolveImageUrl(row.imageUrl)"
            class="banner-thumb content-img"
            :src="resolveImageUrl(row.imageUrl)"
            :alt="row.title"
            lazy
            fit="cover"
          />
          <span v-else class="cell-muted">文字卡</span>
        </template>
        <template #link="{ row }">
          <span v-if="row.link">{{ row.link }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
        <template #enabled="{ row }">
          <t-switch
            v-accessible-field="`轮播图展示：${row.title}`"
            :value="row.enabled"
            :loading="acting === row.id"
            :aria-label="`轮播图展示：${row.title}`"
            @change="() => onToggle(row)"
          />
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-button variant="text" size="small" @click="openEdit(row)">
              <template #icon><EditIcon /></template>
              编辑
            </t-button>
            <t-popconfirm
              content="确认删除该轮播图？删除后不可恢复。"
              :confirm-btn="{ content: '删除', theme: 'danger' }"
              @confirm="onDelete(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                <template #icon><DeleteIcon /></template>
                删除
              </t-button>
            </t-popconfirm>
          </div>
        </template>
        <template #empty>
          <ListEmptyState description="暂无轮播图">
            <template #action>
              <t-button theme="primary" @click="openCreate">新增轮播图</t-button>
            </template>
          </ListEmptyState>
        </template>
      </t-table>
    </div>

    <t-dialog
      :visible="dialogVisible"
      :header="dialogMode === 'create' ? '新增轮播图' : '编辑轮播图'"
      width="560px"
      @close="closeForm"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="closeForm">取消</t-button>
          <t-button theme="primary" :loading="submitting" @click="onConfirm">
            {{ dialogMode === 'create' ? '确认新增' : '保存修改' }}
          </t-button>
        </div>
      </template>
      <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
        <t-form-item label="轮播标题" name="title">
          <t-input v-accessible-field v-model="form.title" :maxlength="64" placeholder="如 2026 秋季创业路演周…" />
        </t-form-item>
        <t-form-item label="副标题" name="subtitle">
          <t-input v-accessible-field v-model="form.subtitle" :maxlength="128" placeholder="一句话补充说明…" />
        </t-form-item>
        <t-form-item label="图片地址" name="imageUrl">
          <t-input v-accessible-field v-model="form.imageUrl" :maxlength="512" placeholder="素材库图片地址，可留空…" />
          <t-image v-if="imagePreviewUrl" class="image-preview content-img" :src="imagePreviewUrl" :alt="form.title" fit="cover" />
        </t-form-item>
        <t-form-item label="跳转路径" name="link">
          <t-input v-accessible-field v-model="form.link" :maxlength="512" placeholder="移动端站内路径，如 /events…" />
        </t-form-item>
        <div class="form-row">
          <t-form-item label="排序值" name="sort">
            <t-input-number v-accessible-field v-model="form.sort" :min="0" theme="column" class="ctl-w-full" />
          </t-form-item>
          <t-form-item label="展示" name="enabled">
            <t-switch v-accessible-field v-model="form.enabled" />
          </t-form-item>
        </div>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.panel-tip {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.carousel-switch {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 14px;
  color: var(--td-text-color-secondary);
}

/* 缩略图：表格图片列与弹窗即时预览统一 72×40 cover 圆角 */
.banner-thumb,
.image-preview {
  width: 72px;
  height: 40px;
  border-radius: var(--td-radius-default);
  overflow: hidden;
  flex-shrink: 0;
}

.image-preview {
  margin-top: 8px;
}

/* 行内 span 的次级文字：不能复用全局 .cell-sub（其 margin-top 对行内元素无效） */
.cell-muted {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
</style>
