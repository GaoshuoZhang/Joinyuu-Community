<script setup lang="ts">
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { computed, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon, EditIcon } from 'tdesign-icons-vue-next'
import {
  createDictEntry,
  deleteDictEntry,
  fetchDictEntries,
  toggleDictEntry,
  updateDictEntry,
} from '@/api/dicts'
import { fetchGoods } from '@/api/mall'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { DictEntry } from '@/types'

/* 商品类别（字典 goods_category）维护弹窗：由「数据字典 > 商品类型」迁移至商品管理页，
 * 在原字典管理（新增/启停/删除）基础上增加类别级「可见范围 / 可下单范围」。
 * 门槛语义：商品同时通过「类别范围」与「商品自身范围」才可见/可下单，空数组 = 不限。
 * 删除仍被商品引用的类别时必须指定新的启用类别，由服务端在同一事务内迁移商品。 */

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean]; success: [] }>()

const loading = ref(false)
const saving = ref(false)
const acting = ref('')
const formRef = ref()
const entries = ref<DictEntry[]>([])
const editingCode = ref('')
const formVisible = ref(false)

/* 删除需要迁移商品时：指定新类别子弹窗 + 各类别下（未删除）商品数 */
const replacementVisible = ref(false)
const replacingEntry = ref<DictEntry | null>(null)
const replacementCode = ref('')
const goodsCounts = ref<Record<string, number>>({})

const columns = [
  { colKey: 'label', title: '类别名称', cell: 'label', width: 150, resizable: true },
  { colKey: 'code', title: '编码', cell: 'code', width: 96, resizable: true },
  { colKey: 'visibility', title: '可见范围', cell: 'visibility', width: 150, resizable: true },
  { colKey: 'ordering', title: '可下单范围', cell: 'ordering', width: 150, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 140, fixed: 'right' as const, resizable: false },
]

const form = reactive({
  label: '',
  visibilityIdentities: [] as string[],
  visibilityLevels: [] as string[],
  orderIdentities: [] as string[],
  orderLevels: [] as string[],
})
const rules: FormProps['rules'] = {
  label: [{ validator: (value: string) => !!value.trim(), message: '请输入类别名称', trigger: 'submit' }],
}

const editingEntry = computed(() => entries.value.find((e) => e.code === editingCode.value) ?? null)
const formTitle = computed(() => (editingCode.value ? `编辑类别「${editingEntry.value?.label ?? ''}」` : '新增类别'))
/* 迁移目标：其他仍启用的类别（排除自身） */
const replacementOptions = computed(() =>
  entries.value
    .filter((e) => e.status === 'enabled' && e.code !== replacingEntry.value?.code)
    .map((e) => ({ label: e.label, value: e.code })),
)

/** 范围摘要文案（空 = 不限；身份与等级分别列出） */
function scopeText(identities: string[], levels: string[]): string {
  if (!identities.length && !levels.length) return '不限'
  const idNames = identities.map((code) => visibilityIdentityOptions.find((o) => o.value === code)?.label ?? code)
  const levelNames = levels.map((level) => `${level} 级`)
  return [...idNames, ...levelNames].join('、')
}

function clearForm() {
  editingCode.value = ''
  form.label = ''
  form.visibilityIdentities = []
  form.visibilityLevels = []
  form.orderIdentities = []
  form.orderLevels = []
}

async function load() {
  loading.value = true
  try {
    entries.value = await fetchDictEntries('goods_category')
    await loadGoodsCounts()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '类别加载失败')
  } finally {
    loading.value = false
  }
}

/** 各类别下（未删除）商品数：删除前据此判断是否需要先指定新类别 */
async function loadGoodsCounts() {
  const list = entries.value
  const pairs = await Promise.all(
    list.map(async (entry): Promise<[string, number]> => {
      try {
        const res = await fetchGoods({ page: 1, pageSize: 1, category: entry.code })
        return [entry.code, res.total]
      } catch {
        /* 计数失败按无引用处理：删除时服务端仍会二次校验拦截 */
        return [entry.code, 0]
      }
    }),
  )
  goodsCounts.value = Object.fromEntries(pairs)
}

function openCreate() {
  if (saving.value) return
  clearForm()
  formVisible.value = true
}

function openEdit(entry: DictEntry) {
  if (saving.value) return
  selectEntry(entry)
  formVisible.value = true
}

function selectEntry(entry: DictEntry) {
  editingCode.value = entry.code
  form.label = entry.label
  form.visibilityIdentities = [...entry.visibilityIdentities]
  form.visibilityLevels = [...entry.visibilityLevels]
  form.orderIdentities = [...entry.orderIdentities]
  form.orderLevels = [...entry.orderLevels]
}

/** 可下单范围一键同步为可见范围（与商品/活动表单同一交互） */
function syncOrdering() {
  form.orderIdentities = [...form.visibilityIdentities]
  form.orderLevels = [...form.visibilityLevels]
}

async function onSubmit() {
  if (saving.value) return
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  const label = form.label.trim()
  saving.value = true
  try {
    const payload = {
      label,
      visibilityIdentities: form.visibilityIdentities,
      visibilityLevels: form.visibilityLevels,
      orderIdentities: form.orderIdentities,
      orderLevels: form.orderLevels,
    }
    const isEdit = !!editingCode.value
    if (isEdit) await updateDictEntry('goods_category', editingCode.value, payload)
    else await createDictEntry('goods_category', payload)
    MessagePlugin.success(isEdit ? '类别已保存' : '类别已新增')
    formVisible.value = false
    clearForm()
    await load()
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function onToggle(entry: DictEntry) {
  acting.value = entry.code
  try {
    await toggleDictEntry('goods_category', entry.code)
    await load()
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/** 无引用商品：二次确认后直接删除 */
async function onDelete(entry: DictEntry) {
  acting.value = entry.code
  try {
    await deleteDictEntry('goods_category', entry.code)
    MessagePlugin.success('类别已删除')
    await load()
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    acting.value = ''
  }
}

/** 仍有引用商品：先指定新类别，确认后迁移商品再删除 */
function openReplacement(entry: DictEntry) {
  replacingEntry.value = entry
  replacementCode.value = ''
  replacementVisible.value = true
}

function closeReplacement() {
  if (saving.value) return
  replacementVisible.value = false
}

async function confirmReplacement() {
  const entry = replacingEntry.value
  if (!entry || !replacementCode.value) return
  const moved = goodsCounts.value[entry.code] ?? 0
  saving.value = true
  try {
    await deleteDictEntry('goods_category', entry.code, replacementCode.value)
    MessagePlugin.success(`已删除类别并迁移 ${moved} 件商品`)
    replacementVisible.value = false
    await load()
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    saving.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      formVisible.value = false
      replacementVisible.value = false
      void load()
    }
  },
)

const formProtectedVisible = computed({ get: () => formVisible.value, set: (value) => { formVisible.value = value } })
const { close: closeForm, guardClose } = useDialogFormProtection(form, formProtectedVisible, saving)

/** 关闭主弹窗：子弹窗有未保存修改时先确认（保留原关闭保护语义） */
function closeDialog() {
  if (saving.value) return
  guardClose(() => {
    formVisible.value = false
    emit('update:visible', false)
  }, '关闭')
}
</script>

<template>
  <t-dialog :visible="visible" header="商品类别" width="880px" :footer="false" @close="closeDialog">
    <div class="cat-body">
      <p class="panel-tip">类别即商品类型（编码自动分配）；可见 / 可下单范围为类别级门槛，留空表示不限；商品需同时通过类别与自身范围。</p>

      <div class="cat-toolbar">
        <span class="cat-toolbar__count">共 {{ entries.length }} 个类别</span>
        <t-button theme="primary" :disabled="saving" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增类别
        </t-button>
      </div>

      <t-table
        :data="entries"
        :columns="columns"
        :loading="loading"
        row-key="code"
        table-layout="fixed"
        hover
        resizable
      >
        <template #label="{ row }">
          <div class="cell-title">{{ row.label }}</div>
        </template>
        <template #code="{ row }">
          <t-tag variant="outline" size="small">{{ row.code }}</t-tag>
        </template>
        <template #visibility="{ row }">
          <span class="cell-scope" :title="scopeText(row.visibilityIdentities, row.visibilityLevels)">
            {{ scopeText(row.visibilityIdentities, row.visibilityLevels) }}
          </span>
        </template>
        <template #ordering="{ row }">
          <span class="cell-scope" :title="scopeText(row.orderIdentities, row.orderLevels)">
            {{ scopeText(row.orderIdentities, row.orderLevels) }}
          </span>
        </template>
        <template #status="{ row }">
          <t-switch
            v-accessible-field="`类别「${row.label}」启用状态`"
            :value="row.status === 'enabled'"
            :loading="acting === row.code"
            :aria-label="`类别「${row.label}」启用状态`"
            @change="() => onToggle(row)"
          />
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-button variant="text" size="small" :disabled="saving" @click="openEdit(row)">
              <template #icon><EditIcon /></template>
              编辑
            </t-button>
            <t-popconfirm
              v-if="(goodsCounts[row.code] ?? 0) === 0"
              :content="`确认删除类别「${row.label}」？删除后不再作为选项下发。`"
              :confirm-btn="{ content: '删除', theme: 'danger' }"
              @confirm="onDelete(row)"
            >
              <t-button variant="text" theme="danger" size="small" :disabled="saving" :loading="acting === row.code">
                <template #icon><DeleteIcon /></template>
                删除
              </t-button>
            </t-popconfirm>
            <!-- 仍有商品引用：需先指定新类别（迁移后删除） -->
            <t-button
              v-else
              variant="text"
              theme="danger"
              size="small"
              :disabled="saving"
              @click="openReplacement(row)"
            >
              <template #icon><DeleteIcon /></template>
              删除
            </t-button>
          </div>
        </template>
        <template #empty>
          <t-empty description="暂无类别，请点击右上角新增" />
        </template>
      </t-table>
    </div>

    <!-- 新增 / 编辑子弹窗 -->
    <t-dialog :visible="formVisible" :header="formTitle" width="720px" :footer="false" @close="closeForm">
      <t-form ref="formRef" label-align="top" :data="form" :rules="rules" @submit="onSubmit">
        <t-form-item label="类别名称" name="label">
          <t-input v-accessible-field v-model="form.label" :maxlength="16" clearable placeholder="如 实物商品、权益券…" />
        </t-form-item>
        <!-- 可见/可下单各自成组：身份与等级并排；两行共用一个网格（列宽一致），
             「同步可见范围」置于可下单组两列之间的窄列，与左右字段标题同行 -->
        <div class="scope-grid">
          <t-form-item label="类别可见范围 · 身份" name="visibilityIdentities">
            <t-select v-accessible-field v-model="form.visibilityIdentities" multiple clearable :options="visibilityIdentityOptions" placeholder="留空 = 不限身份…" />
          </t-form-item>
          <span aria-hidden="true"></span>
          <t-form-item label="类别可见范围 · 等级" name="visibilityLevels">
            <t-select v-accessible-field v-model="form.visibilityLevels" multiple clearable :options="userLevelOptions" placeholder="留空 = 不限等级…" />
          </t-form-item>
          <t-form-item label="类别可下单范围 · 身份" name="orderIdentities">
            <t-select v-accessible-field v-model="form.orderIdentities" multiple clearable :options="visibilityIdentityOptions" placeholder="留空 = 不限身份…" />
          </t-form-item>
          <t-button variant="text" size="small" class="sync-btn" @click="syncOrdering">同步可见范围</t-button>
          <t-form-item label="类别可下单范围 · 等级" name="orderLevels">
            <t-select v-accessible-field v-model="form.orderLevels" multiple clearable :options="userLevelOptions" placeholder="留空 = 不限等级…" />
          </t-form-item>
        </div>
      </t-form>
      <div class="cat-form__actions">
        <t-button theme="primary" :loading="saving" @click="onSubmit">{{ editingCode ? '保存修改' : '新增类别' }}</t-button>
        <t-button variant="outline" :disabled="saving" @click="closeForm">取消</t-button>
      </div>
    </t-dialog>

    <!-- 删除前指定新类别（迁移该类别下的商品） -->
    <t-dialog
      :visible="replacementVisible"
      header="指定新的商品类别"
      width="520px"
      :footer="false"
      @close="closeReplacement"
    >
      <div class="replacement">
        <p class="replacement__tip">
          类别「{{ replacingEntry?.label }}」下还有 {{ goodsCounts[replacingEntry?.code ?? ''] ?? 0 }} 件商品，删除后这些商品将归入新类别。
        </p>
        <t-select
          v-accessible-field="'新的商品类别'"
          v-model="replacementCode"
          :options="replacementOptions"
          placeholder="请选择启用的商品类别…"
          clearable
        />
      </div>
      <div class="cat-form__actions">
        <t-button theme="primary" :loading="saving" :disabled="!replacementCode" @click="confirmReplacement">
          确认删除并迁移
        </t-button>
        <t-button variant="outline" :disabled="saving" @click="closeReplacement">取消</t-button>
      </div>
    </t-dialog>
  </t-dialog>
</template>

<style scoped>
.cat-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 70vh;
  overflow-y: auto;
  /* 滚到边界时不将滚动透传给弹窗遮罩下的页面（M-07） */
  overscroll-behavior: contain;
}

.panel-tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.cat-toolbar__count {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cell-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

/* 范围摘要单行截断（完整文本由 title 属性给出） */
.cell-scope {
  display: block;
  overflow: hidden;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cat-form__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

/* 范围并排：左右两列为身份/等级字段，中间窄列留给「同步可见范围」；
 * 两行共用一个网格保证列宽一致，行距与字段后间距沿用表单默认节奏（--td-comp-margin-xxl）；
 * top 对齐使按钮与左右两个字段标题同处一行 */
.scope-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  gap: var(--td-comp-margin-xxl) 12px;
  margin-bottom: var(--td-comp-margin-xxl);
}

.scope-grid :deep(.t-form-item) {
  margin-bottom: 0;
}

.sync-btn {
  white-space: nowrap;
}

.replacement {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.replacement__tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
