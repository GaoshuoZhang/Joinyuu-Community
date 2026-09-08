<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { AddIcon, RefreshIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import { createColumn, fetchArticles, fetchColumns, toggleColumnStatus, updateColumn } from '@/api/contents'
import type { ArticleColumn } from '@/types'

/* 栏目管理面板：新增/编辑栏目 + 启用/停用（停用后新文章不可选择该栏目）；
 * 改名时服务端同步刷新文章冗余 columnName */
const loading = ref(false)
const list = ref<ArticleColumn[]>([])
const acting = ref('')

const columns = [
  { colKey: 'name', title: '栏目', cell: 'name', width: 180, resizable: true },
  { colKey: 'description', title: '说明', ellipsis: true },
  { colKey: 'sort', title: '排序权重', width: 100, resizable: true },
  { colKey: 'articleCount', title: '文章数', cell: 'articleCount', width: 90, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 90, resizable: true },
  { colKey: 'createdAt', title: '创建时间', width: 130, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 130 },
]

/* 文章数：从文章列表聚合展示（原型直接复用 fetchArticles 全量） */
const articleCountByColumn = ref<Record<string, number>>({})

async function load() {
  loading.value = true
  try {
    const [cols, articlesRes] = await Promise.all([
      fetchColumns(),
      import('@/api/contents').then((m) => m.fetchArticles({ page: 1, pageSize: 999 })),
    ])
    list.value = cols
    const counts: Record<string, number> = {}
    for (const a of articlesRes.list) counts[a.columnId] = (counts[a.columnId] ?? 0) + 1
    articleCountByColumn.value = counts
  } finally {
    loading.value = false
  }
}

/* 启用 / 停用 */
async function onToggle(row: ArticleColumn) {
  acting.value = row.id
  try {
    await toggleColumnStatus(row.id)
    MessagePlugin.success(row.status === 'enabled' ? '栏目已停用' : '栏目已启用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 创建 / 编辑栏目弹窗（面板内表单，契约与共享弹窗一致） */
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const currentColumn = ref<ArticleColumn | null>(null)
const submitting = ref(false)
const formRef = ref()

const form = reactive({
  name: '',
  description: '',
  sort: 6,
})

watch(dialogVisible, (v) => {
  if (!v) return
  if (dialogMode.value === 'edit' && currentColumn.value) {
    form.name = currentColumn.value.name
    form.description = currentColumn.value.description
    form.sort = currentColumn.value.sort
  } else {
    form.name = ''
    form.description = ''
    form.sort = Math.max(0, ...list.value.map((c) => c.sort)) + 1
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
    const payload = { name: form.name, description: form.description, sort: form.sort }
    if (dialogMode.value === 'create') {
      const column = await createColumn(payload)
      MessagePlugin.success(`栏目已创建并启用（${column.id}）`)
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
  <div class="column-panel">
    <div class="page-filter-bar">
      <span class="panel-tip">栏目按排序权重升序展示于成员端；停用栏目仅不可再选择，已有文章不受影响。</span>
      <t-button variant="outline" style="margin-left: auto" @click="load">
        <template #icon><RefreshIcon /></template>
        刷新
      </t-button>
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
        :columns="columns"
        :loading="loading"
        empty="暂无栏目数据"
      >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <div class="cell-sub">{{ row.id }}</div>
        </template>
        <template #articleCount="{ row }">{{ articleCountByColumn[row.id] ?? 0 }}</template>
        <template #status="{ row }">
          <StatusTag entity="column" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
            <t-popconfirm
              v-if="row.status === 'enabled'"
              content="确认停用该栏目？停用后新文章不可选择"
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
          </div>
        </template>
      </t-table>
    </div>

    <!-- 创建 / 编辑栏目弹窗 -->
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
            {{ dialogMode === 'create' ? '确认创建' : '保存修改' }}
          </t-button>
        </div>
      </template>
      <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
        <div class="form-row">
          <t-form-item label="栏目名称" name="name">
            <t-input v-model="form.name" placeholder="如 创投观察" />
          </t-form-item>
          <t-form-item label="排序权重" name="sort">
            <t-input-number v-model="form.sort" :min="1" theme="column" style="width: 100%" />
          </t-form-item>
        </div>
        <t-form-item label="栏目说明" name="description">
          <t-textarea
            v-model="form.description"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="栏目定位与内容方向"
          />
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
</style>
