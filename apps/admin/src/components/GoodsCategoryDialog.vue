<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { DeleteIcon, EditIcon } from 'tdesign-icons-vue-next'
import {
  createDictEntry,
  deleteDictEntry,
  fetchDictEntries,
  toggleDictEntry,
  updateDictEntry,
} from '@/api/dicts'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { DictEntry } from '@/types'

/* 商品类别（字典 goods_category）维护弹窗：由「数据字典 > 商品类型」迁移至商品管理页，
 * 在原字典管理（新增/启停/删除）基础上增加类别级「可见范围 / 可下单范围」。
 * 门槛语义：商品同时通过「类别范围」与「商品自身范围」才可见/可下单，空数组 = 不限。 */

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [boolean]; success: [] }>()

const loading = ref(false)
const saving = ref(false)
const acting = ref('')
const entries = ref<DictEntry[]>([])
const editingCode = ref('')

const form = reactive({
  label: '',
  visibilityIdentities: [] as string[],
  visibilityLevels: [] as string[],
  orderIdentities: [] as string[],
  orderLevels: [] as string[],
})

const editingEntry = computed(() => entries.value.find((e) => e.code === editingCode.value) ?? null)
const formTitle = computed(() => (editingCode.value ? `编辑类别「${editingEntry.value?.label ?? ''}」` : '新增类别'))

/** 范围摘要文案（空 = 不限；身份与等级分别列出） */
function scopeText(identities: string[], levels: string[]): string {
  if (!identities.length && !levels.length) return '不限'
  const idNames = identities.map((code) => visibilityIdentityOptions.find((o) => o.value === code)?.label ?? code)
  const levelNames = levels.map((level) => `${level} 级`)
  return [...idNames, ...levelNames].join('、')
}

function resetForm() {
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
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '类别加载失败')
  } finally {
    loading.value = false
  }
}

function openEdit(entry: DictEntry) {
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
  const label = form.label.trim()
  if (!label) return void MessagePlugin.warning('请输入类别名称')
  saving.value = true
  try {
    const payload = {
      label,
      visibilityIdentities: form.visibilityIdentities,
      visibilityLevels: form.visibilityLevels,
      orderIdentities: form.orderIdentities,
      orderLevels: form.orderLevels,
    }
    if (editingCode.value) await updateDictEntry('goods_category', editingCode.value, payload)
    else await createDictEntry('goods_category', payload)
    MessagePlugin.success(editingCode.value ? '类别已保存' : '类别已新增')
    resetForm()
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

async function onDelete(entry: DictEntry) {
  acting.value = entry.code
  try {
    await deleteDictEntry('goods_category', entry.code)
    if (editingCode.value === entry.code) resetForm()
    MessagePlugin.success('类别已删除')
    await load()
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    acting.value = ''
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetForm()
      void load()
    }
  },
)
</script>

<template>
  <t-dialog
    :visible="visible"
    header="商品类别"
    width="880px"
    :footer="false"
    @close="emit('update:visible', false)"
  >
    <div class="cat-body">
      <p class="panel-tip">类别即商品类型（编码 GC 前缀自动分配）；「可见范围 / 可下单范围」为类别级门槛，留空表示不限；商品需同时通过类别范围与自身范围才可见 / 可下单。</p>

      <!-- 表单：新增 / 编辑 -->
      <div class="cat-form">
        <h4 class="cat-form__title">{{ formTitle }}</h4>
        <t-form label-align="top" :data="form">
          <t-form-item label="类别名称" name="label">
            <t-input v-model="form.label" :maxlength="16" clearable placeholder="如 实物商品、权益券…" />
          </t-form-item>
          <!-- 可见/可下单各自成组：身份与等级并排；两行共用一个网格（列宽一致），
               「同步可见范围」置于可下单组两列之间的窄列，与左右字段标题同行 -->
          <div class="scope-grid">
            <t-form-item label="类别可见范围 · 身份" name="visibilityIdentities">
              <t-select v-model="form.visibilityIdentities" multiple clearable :options="visibilityIdentityOptions" placeholder="留空 = 不限身份…" />
            </t-form-item>
            <span aria-hidden="true"></span>
            <t-form-item label="类别可见范围 · 等级" name="visibilityLevels">
              <t-select v-model="form.visibilityLevels" multiple clearable :options="userLevelOptions" placeholder="留空 = 不限等级（等级仅社区个体/社区企业身份拥有）…" />
            </t-form-item>
            <t-form-item label="类别可下单范围 · 身份" name="orderIdentities">
              <t-select v-model="form.orderIdentities" multiple clearable :options="visibilityIdentityOptions" placeholder="留空 = 不限身份…" />
            </t-form-item>
            <t-button variant="text" size="small" class="sync-btn" @click="syncOrdering">同步可见范围</t-button>
            <t-form-item label="类别可下单范围 · 等级" name="orderLevels">
              <t-select v-model="form.orderLevels" multiple clearable :options="userLevelOptions" placeholder="留空 = 不限等级…" />
            </t-form-item>
          </div>
        </t-form>
        <div class="cat-form__actions">
          <t-button theme="primary" :loading="saving" @click="onSubmit">{{ editingCode ? '保存修改' : '新增类别' }}</t-button>
          <t-button v-if="editingCode" variant="outline" @click="resetForm">取消编辑</t-button>
        </div>
      </div>

      <!-- 列表：已有类别 -->
      <t-loading :loading="loading" size="small">
        <t-list v-if="entries.length" size="small" class="cat-list">
          <t-list-item v-for="entry in entries" :key="entry.code">
            <div class="cat-item">
              <div class="cat-item__head">
                <span class="cat-label">{{ entry.label }}</span>
                <t-tag variant="outline" size="small">{{ entry.code }}</t-tag>
                <t-tag v-if="entry.status !== 'enabled'" theme="warning" variant="light" size="small">已停用</t-tag>
                <span v-if="editingCode === entry.code" class="cat-editing">编辑中</span>
              </div>
              <p class="cat-scope">可见：{{ scopeText(entry.visibilityIdentities, entry.visibilityLevels) }}</p>
              <p class="cat-scope">可下单：{{ scopeText(entry.orderIdentities, entry.orderLevels) }}</p>
            </div>
            <template #action>
              <div class="cat-actions">
                <t-switch
                  :value="entry.status === 'enabled'"
                  :loading="acting === entry.code"
                  :aria-label="`类别「${entry.label}」启用状态`"
                  @change="() => onToggle(entry)"
                />
                <t-button variant="text" size="small" :disabled="editingCode === entry.code" @click="openEdit(entry)">
                  <template #icon><EditIcon /></template>
                  编辑
                </t-button>
                <t-popconfirm
                  :content="`确认删除类别「${entry.label}」？已使用该类别编码的历史商品不受影响，但不再作为选项下发。`"
                  @confirm="onDelete(entry)"
                >
                  <t-button variant="text" theme="danger" size="small" :loading="acting === entry.code">
                    <template #icon><DeleteIcon /></template>
                    删除
                  </t-button>
                </t-popconfirm>
              </div>
            </template>
          </t-list-item>
        </t-list>
        <t-empty v-else description="暂无类别，请在上方新增" />
      </t-loading>
    </div>
  </t-dialog>
</template>

<style scoped>
.cat-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 70vh;
  overflow-y: auto;
}

.cat-form {
  padding: 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  background: var(--td-bg-color-secondarycontainer);
}

.cat-form__title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}

.cat-form__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
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

.cat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cat-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cat-label {
  font-weight: 600;
}

.cat-editing {
  font-size: 12px;
  color: var(--td-brand-color);
}

.cat-scope {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cat-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>