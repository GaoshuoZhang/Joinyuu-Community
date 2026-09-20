<script setup lang="ts">
import ListErrorState from '@/components/ListErrorState.vue'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { AddIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import { createColumn, deleteColumn, fetchColumns, toggleColumnStatus, toggleColumnSubmission, updateColumn } from '@/api/contents'
import PageHeader from '@/components/PageHeader.vue'
import ColumnController from '@/components/ColumnController.vue'
import type { ArticleColumn } from '@/types'

/* 栏目管理面板：新增/编辑栏目（含「开放投稿」开关） + 启用/停用 + 删除；
 * 系统保留栏目「未指定」：不可编辑/停用/删除，删除其他栏目时其文章自动转移至此 */
const loading = ref(false)
const loadError = ref('')
const list = ref<ArticleColumn[]>([])
const acting = ref('')

const columns = [
  { colKey: 'name', title: '栏目', cell: 'name', width: 180, resizable: true , ellipsis: true},
  { colKey: 'description', title: '说明', ellipsis: true },
  { colKey: 'sort', title: '排序权重', width: 100, resizable: true , ellipsis: true},
  { colKey: 'articleCount', title: '文章数', cell: 'articleCount', width: 90, resizable: true , ellipsis: true},
  { colKey: 'submissionOpen', title: '开放投稿', cell: 'submissionOpen', width: 110, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 90, resizable: true , ellipsis: true},
  { colKey: 'createdAt', title: '创建时间', width: 130, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 170 },
]

/* 列配置：本地持久化显隐/顺序 */
const visibleColKeys = ref<string[]>(columns.map((c) => c.colKey))

const visibleColumns = computed(() => {
  const byKey = new Map(columns.map((c) => [c.colKey, c]))
  return visibleColKeys.value.map((k) => byKey.get(k)).filter(Boolean)
})

/* 文章数：从文章列表聚合展示（直接复用 fetchArticles 全量） */
const articleCountByColumn = ref<Record<string, number>>({})

async function load() {
  loading.value = true
  try {
    const [cols, articlesRes] = await Promise.all([
      fetchColumns(),
      import('@/api/contents').then((m) => m.fetchArticles({ page: 1, pageSize: 100 })),
    ])
    list.value = cols
    const counts: Record<string, number> = {}
    /* 多选栏目：一篇文章可计入多个栏目 */
    for (const a of articlesRes.list) for (const id of a.columnIds) counts[id] = (counts[id] ?? 0) + 1
    articleCountByColumn.value = counts
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

/* 启用 / 停用 */
async function onToggle(row: ArticleColumn) {
  acting.value = row.id
  /* 先取旧状态再调接口：接口原地更新了 row.status，后再判断会拿到新值导致提示反转 */
  const wasEnabled = row.status === 'enabled'
  try {
    await toggleColumnStatus(row.id)
    MessagePlugin.success(wasEnabled ? '栏目已停用' : '栏目已启用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 开放 / 关闭投稿 */
async function onToggleSubmission(row: ArticleColumn) {
  acting.value = row.id + ':submission'
  try {
    await toggleColumnSubmission(row.id)
    MessagePlugin.success(row.submissionOpen ? '已关闭该栏目投稿' : '已开放该栏目投稿')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 删除栏目：其中文章自动转移至「未指定」 */
async function onDelete(row: ArticleColumn) {
  acting.value = row.id + ':delete'
  try {
    await deleteColumn(row.id)
    MessagePlugin.success(`栏目「${row.name}」已删除，其中文章已转移至「未指定」栏目`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    acting.value = ''
  }
}

/* 新增 / 编辑栏目弹窗（面板内表单，契约与共享弹窗一致） */
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const currentColumn = ref<ArticleColumn | null>(null)
const submitting = ref(false)
const formRef = ref()

const form = reactive({
  name: '',
  description: '',
  sort: 6,
  submissionOpen: true,
})

watch(dialogVisible, (v) => {
  if (!v) return
  if (dialogMode.value === 'edit' && currentColumn.value) {
    form.name = currentColumn.value.name
    form.description = currentColumn.value.description
    form.sort = currentColumn.value.sort
    form.submissionOpen = currentColumn.value.submissionOpen
  } else {
    form.name = ''
    form.description = ''
    form.sort = Math.max(0, ...list.value.map((c) => c.sort)) + 1
    form.submissionOpen = true
  }
  nextTick(() => formRef.value?.clearValidate())
})

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入栏目名称', trigger: 'submit' }],
  description: [{ required: true, message: '请输入栏目说明', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    const payload = { name: form.name, description: form.description, sort: form.sort, submissionOpen: form.submissionOpen }
    if (dialogMode.value === 'create') {
      const column = await createColumn(payload)
      MessagePlugin.success(`栏目已新增并启用（${column.id}）`)
    } else if (currentColumn.value) {
      await updateColumn(currentColumn.value.id, payload)
      MessagePlugin.success('栏目修改已保存')
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
  currentColumn.value = null
  dialogVisible.value = true
}

function openEdit(row: ArticleColumn) {
  dialogMode.value = 'edit'
  currentColumn.value = row
  dialogVisible.value = true
}

onMounted(load)
</script>

<template>
  <div class="column-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="栏目管理" description="文章栏目的新增、排序与投稿开关；系统保留栏目「未指定」不可变更">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="contents-columns"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
      </template>
    </PageHeader>
    <div class="page-filter-bar">
      <span class="panel-tip">栏目按排序权重升序展示于成员端；停用栏目仅不可再选择，已有文章不受影响。</span>
      <t-button theme="primary" @click="openCreate">
        <template #icon><AddIcon /></template>
        新增栏目
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="visibleColumns"
        :loading="loading"
        empty="暂无栏目"
      >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <div class="cell-sub">{{ row.id }}</div>
        </template>
        <template #articleCount="{ row }">{{ articleCountByColumn[row.id] ?? 0 }}</template>
        <template #submissionOpen="{ row }">
          <t-switch
            :value="row.submissionOpen"
            :disabled="!!row.system"
            :loading="acting === row.id + ':submission'"
            @change="() => onToggleSubmission(row)"
          />
        </template>
        <template #status="{ row }">
          <t-tag v-if="row.system" theme="default" variant="light">保留</t-tag>
          <StatusTag v-else entity="column" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <template v-if="row.system">
              <span class="system-note">系统保留栏目，不可编辑/停用/删除</span>
            </template>
            <template v-else>
              <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
              <t-popconfirm
                v-if="row.status === 'enabled'"
                content="确认停用该栏目？停用后该栏目下的文章对用户不再可见。"
                @confirm="onToggle(row)"
              >
                <t-button variant="text" size="small" theme="danger" :loading="acting === row.id">
                  停用
                </t-button>
              </t-popconfirm>
              <t-button
                v-else
                variant="text"
                size="small"
                theme="primary"
                :loading="acting === row.id"
                @click="onToggle(row)"
              >
                启用
              </t-button>
              <t-popconfirm
                content="确认删除该栏目？其中文章将自动转移至「未指定」栏目。"
                @confirm="onDelete(row)"
              >
                <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                  删除
                </t-button>
              </t-popconfirm>
            </template>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 新增 / 编辑栏目弹窗 -->
    <t-dialog
      :visible="dialogVisible"
      :header="dialogMode === 'create' ? '新增栏目' : '编辑栏目'"
      width="520px"
      @close="dialogVisible = false"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="dialogVisible = false">取消</t-button>
          <t-button theme="primary" :loading="submitting" @click="onConfirm">
            {{ dialogMode === 'create' ? '确认新增' : '保存修改' }}
          </t-button>
        </div>
      </template>
      <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
        <div class="form-row">
          <t-form-item label="栏目名称" name="name">
            <t-input v-model="form.name" placeholder="如 创投观察…" />
          </t-form-item>
          <t-form-item label="排序权重" name="sort">
            <t-input-number v-model="form.sort" :min="1" theme="column" style="width: 100%" />
          </t-form-item>
        </div>
        <t-form-item label="栏目说明" name="description">
          <t-textarea
            v-model="form.description"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="栏目定位与内容方向…"
          />
        </t-form-item>
        <t-form-item label="开放投稿" name="submissionOpen">
          <div class="submission-row">
            <t-switch v-model="form.submissionOpen" />
            <span class="submission-tip">开启后成员端该栏目可接受用户投稿</span>
          </div>
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.panel-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cell-title {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.system-note {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.submission-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.submission-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
