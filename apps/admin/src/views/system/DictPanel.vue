<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import {
  createDictEntry,
  deleteDictEntry,
  dictTypeMap,
  fetchDictEntries,
  toggleDictEntry,
} from '@/api/dicts'
import type { DictEntry, DictType } from '@/types'

/* 数据字典：站点选项词汇的单一来源（需求类别/行业/活动类型）。
 * 页面下拉选项全部改为从字典拉取；label 即业务存储值，暂不支持改名（避免历史数据失配） */
const loading = ref(false)
const acting = ref('')
const activeType = ref<DictType>('demand_category')
const entries = ref<DictEntry[]>([])
const newLabel = ref('')

const typeOptions = (Object.keys(dictTypeMap) as DictType[]).map((t) => ({
  label: dictTypeMap[t],
  value: t,
}))

const query = reactive({})

const columns = [
  { colKey: 'sort', title: '排序', width: 80 , ellipsis: true},
  { colKey: 'label', title: '名称', width: 220 , ellipsis: true},
  { colKey: 'code', title: '编码', width: 120 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 110 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 140 },
]

const enabledCount = computed(() => entries.value.filter((e) => e.status === 'enabled').length)

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    entries.value = await fetchDictEntries(activeType.value)
  } finally {
    loading.value = false
  }
}

function onTypeChange() {
  newLabel.value = ''
  load()
}

async function onCreate() {
  if (!newLabel.value.trim()) {
    MessagePlugin.warning('请输入字典项名称')
    return
  }
  try {
    await createDictEntry(activeType.value, { label: newLabel.value })
    MessagePlugin.success(`字典项「${newLabel.value.trim()}」已新增并启用`)
    newLabel.value = ''
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '新增失败')
  }
}

async function onToggle(row: DictEntry) {
  acting.value = row.code
  try {
    await toggleDictEntry(activeType.value, row.code)
    MessagePlugin.success(row.status === 'enabled' ? '字典项已停用' : '字典项已启用')
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onDelete(row: DictEntry) {
  acting.value = row.code
  try {
    await deleteDictEntry(activeType.value, row.code)
    MessagePlugin.success('字典项已删除')
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    acting.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="dict-panel page-fade-in">
    <PageHeader title="数据字典" description="站点选项词汇的统一配置入口，各业务页面的下拉选项均从字典取用">
    </PageHeader>

    <div class="filter-bar">
      <t-select v-model="activeType" :options="typeOptions" style="width: 180px" @change="onTypeChange" />
      <t-input
        v-model="newLabel"
        clearable
        :placeholder="`新增${dictTypeMap[activeType]}项（新增即启用）`"
        style="width: 280px"
        @enter="onCreate"
      />
      <t-button theme="primary" @click="onCreate">
        <template #icon><AddIcon /></template>
        新增字典项
      </t-button>
      <t-tag variant="light" theme="primary">启用中 {{ enabledCount }} / {{ entries.length }}</t-tag>
    </div>

    <t-table
      row-key="code"
      table-layout="fixed"
      hover
      :loading="loading"
      :data="entries"
      :columns="columns"
    >
      <template #status="{ row }">
        <t-switch
          :value="row.status === 'enabled'"
          :loading="acting === row.code"
          @change="() => onToggle(row)"
        />
      </template>
      <template #op="{ row }">
        <div class="op-cell">
          <t-popconfirm content="确认删除该字典项？已产生的历史业务数据不受影响，仅不再作为选项下发。" @confirm="onDelete(row)">
            <t-button variant="text" theme="danger" size="small" :loading="acting === row.code">
              <template #icon><DeleteIcon /></template>
              删除
            </t-button>
          </t-popconfirm>
        </div>
      </template>
    </t-table>

    <p class="dict-tip">说明：字典项名称（label）即业务存储值，暂不支持改名；停用后各业务页面下拉不再展示该项，历史数据保持原样。</p>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.op-cell {
  display: flex;
  gap: 4px;
}

.dict-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
