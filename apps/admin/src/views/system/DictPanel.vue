<script setup lang="ts">
import { useListQueryState } from '@/utils/listQuery'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { computed, onMounted, ref } from 'vue'
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
const loadError = ref('')
const acting = ref('')
const activeType = ref<DictType>('demand_category')
const entries = ref<DictEntry[]>([])
const newLabel = ref('')

const typeOptions = (Object.keys(dictTypeMap) as DictType[]).map((t) => ({
  label: dictTypeMap[t],
  value: t,
}))

const columns = [
  { colKey: 'sort', title: '排序', width: 80 , ellipsis: true},
  { colKey: 'label', title: '名称', width: 220 , ellipsis: true},
  { colKey: 'code', title: '编码', width: 120 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 110 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 140 },
]

const enabledCount = computed(() => entries.value.filter((e) => e.status === 'enabled').length)

/** 页头描述拼接「启用中 x / y」统计（原筛选行标签移入，避免筛选区堆叠统计） */
const headerDescription = computed(
  () =>
    `站点选项词汇的统一配置入口，各业务页面的下拉选项均从字典取用（启用中 ${enabledCount.value} / ${entries.value.length}）`,
)

async function load(silent = false) {
  syncQuery()
  if (!silent) loading.value = true
  try {
    entries.value = await fetchDictEntries(activeType.value)
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

function onTypeChange() {
  newLabel.value = ''
  load()
}

/* 提交互斥：避免重复点击/连按回车产生并发新增 */
const submitting = ref(false)

async function onCreate() {
  if (submitting.value) return
  if (!newLabel.value.trim()) {
    MessagePlugin.warning('请输入字典项名称')
    return
  }
  submitting.value = true
  try {
    await createDictEntry(activeType.value, { label: newLabel.value })
    MessagePlugin.success(`字典项「${newLabel.value.trim()}」已新增并启用`)
    newLabel.value = ''
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '新增失败')
  } finally {
    submitting.value = false
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

const { syncQuery } = useListQueryState({}, () => { newLabel.value = ''; void load() }, { refs: { type: activeType } })

onMounted(load)
</script>

<template>
  <div class="dict-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="数据字典" :description="headerDescription" />

    <div class="page-filter-bar">
      <t-select class="ctl-w-lg" v-model="activeType" label="字典类型" :options="typeOptions" @change="onTypeChange" />
      <t-input class="ctl-w-2xl"
        v-model="newLabel"
        clearable
        :placeholder="`新增${dictTypeMap[activeType]}项（新增即启用）…`"
        @enter="onCreate"
      />
      <t-button theme="primary" :loading="submitting" @click="onCreate">
        <template #icon><AddIcon /></template>
        新增字典项
      </t-button>
    </div>

    <!-- 表格包 page-card：与全站列表页（含 /system 内角色/日志/归档等）视觉层级一致 -->
    <div class="page-card">
      <t-table
        row-key="code"
        table-layout="fixed"
        hover
        resizable
        :loading="loading"
        :data="entries"
        :columns="columns"
      >
        <template #status="{ row }">
          <t-switch
            :value="row.status === 'enabled'"
            :loading="acting === row.code"
            :aria-label="`字典项「${row.label}」启用状态`"
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
        <template #empty>
          <ListEmptyState description="暂无字典项" />
        </template>
      </t-table>
    </div>

    <p class="dict-tip">说明：字典项名称（label）即业务存储值，暂不支持改名；停用后各业务页面下拉不再展示该项，历史数据保持原样。</p>
  </div>
</template>

<style scoped>
.dict-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
