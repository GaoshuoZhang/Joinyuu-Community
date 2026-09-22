<script setup lang="ts">
import { computed, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { ChevronDownIcon, DownloadIcon } from 'tdesign-icons-vue-next'
import { exportAllRows, exportCsv } from '@/utils/exportCsv'

/**
 * 列表导出按钮：
 * - 仅传 rows → 单按钮，导出当前页；
 * - 同时传 fetchAll + mapRow → 下拉二选一（导出当前页 / 导出全部结果）。
 * 全量导出复用 exportCsv.exportAllRows（按分页接口逐页拉取）。
 */
const props = defineProps<{
  filename: string
  headers: string[]
  /** 当前页已映射行 */
  rows: (string | number)[][]
  fetchAll?: (page: number, pageSize: number) => Promise<{ list: unknown[]; total: number }>
  /* 参数用 any 以接受各视图具体行类型（(p: Project) => ... 等均可赋值） */
  mapRow?: (item: any) => (string | number)[]
}>()

const exporting = ref(false)

const canExportAll = computed(() => !!(props.fetchAll && props.mapRow))

/* 当前页无数据时不导出：避免产出空 CSV 并提示「已导出 0 条」 */
const noData = computed(() => props.rows.length === 0)

const options = computed(() =>
  canExportAll.value
    ? [
        { content: '导出当前页', value: 'page' },
        { content: '导出全部结果', value: 'all' },
      ]
    : [{ content: '导出当前页', value: 'page' }],
)

async function exportPage() {
  if (noData.value) {
    MessagePlugin.warning('当前没有可导出的数据')
    return
  }
  exporting.value = true
  try {
    exportCsv(props.filename, props.headers, props.rows)
    MessagePlugin.success(`已导出当前页 ${props.rows.length} 条数据`)
  } finally {
    exporting.value = false
  }
}

async function exportAll() {
  if (!props.fetchAll || !props.mapRow) return
  exporting.value = true
  try {
    const count = await exportAllRows(props.filename, props.headers, props.mapRow, props.fetchAll)
    MessagePlugin.success(`已导出全部 ${count} 条数据`)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '导出失败，请重试')
  } finally {
    exporting.value = false
  }
}

function onCommand(item: { value?: string | number }) {
  if (item.value === 'all') void exportAll()
  else exportPage()
}
</script>

<template>
  <!-- tooltip 包在触发元素外层：被禁用的 button 自身不触发鼠标事件，提示挂在父层才可见 -->
  <t-tooltip content="当前没有可导出的数据" :disabled="!noData" placement="top">
    <t-dropdown v-if="canExportAll" :options="options" trigger="click" @click="onCommand">
      <t-button variant="outline" :loading="exporting" :disabled="noData">
        <template #icon><DownloadIcon /></template>
        导出
        <template #suffix><ChevronDownIcon /></template>
      </t-button>
    </t-dropdown>
    <t-button v-else variant="outline" :loading="exporting" :disabled="noData" @click="exportPage">
      <template #icon><DownloadIcon /></template>
      导出
    </t-button>
  </t-tooltip>
</template>
