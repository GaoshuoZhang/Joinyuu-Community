<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, SearchIcon, ViewListIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import GoodsFormDialog from '@/components/GoodsFormDialog.vue'
import GoodsCategoryDialog from '@/components/GoodsCategoryDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { fetchGoods, toggleGoodsStatus, archiveGoods } from '@/api/mall'
import { goodsCategoryMap } from '@/constants/status'
import { fetchDictEntries } from '@/api/dicts'
import { statusLabel } from '@/utils/exportCsv'
import type { MallGoods } from '@/types'

/* 商品管理面板：列表 + 上架/下架/归档 + 新增/编辑（新增商品默认下架） */
const loading = ref(false)
const loadError = ref('')
const list = ref<MallGoods[]>([])
const total = ref(0)
const acting = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  category: '',
  status: '',
})

/* 只取 GC 前缀的字典码：goodsCategoryMap 中的 physical/voucher 为历史值，保留会产生重复选项 */
const categoryOptions = ref([
  { label: '全部', value: '' },
  ...Object.entries(goodsCategoryMap)
    .filter(([value]) => value.startsWith('GC'))
    .map(([value, label]) => ({ label, value })),
])

const statusOptions = [
  { label: '全部', value: '' },
  { label: '已上架', value: 'on' },
  { label: '已下架', value: 'off' },
  { label: '待补货', value: 'restock' },
]

/* 商品类别维护弹窗（原「数据字典 > 商品类型」入口，含类别级可见/可下单范围） */
const categoryDialogVisible = ref(false)

const dataColumns = [
  { colKey: 'name', title: '商品', cell: 'name', width: 220, resizable: true , ellipsis: true},
  { colKey: 'category', title: '类型', cell: 'category', width: 100, resizable: true , ellipsis: true},
  { colKey: 'points', title: '兑换积分', width: 100, resizable: true , ellipsis: true},
  { colKey: 'stock', title: '库存', cell: 'stock', width: 90, resizable: true , ellipsis: true},
  { colKey: 'redeemedCount', title: '累计兑换', width: 100, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true , ellipsis: true},
  { colKey: 'createdAt', title: '创建时间', width: 170, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 170 },
]

/* 列配置：本地持久化显隐/顺序 */
const visibleColKeys = ref<string[]>(dataColumns.map((c) => c.colKey))

const visibleColumns = computed(() => {
  const byKey = new Map(dataColumns.map((c) => [c.colKey, c]))
  return visibleColKeys.value.map((k) => byKey.get(k)).filter(Boolean)
})

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  total: total.value,
  showJumper: true,
}))

/* 请求序号守卫：仅最后一次请求可写回状态，避免快速切页/改筛选时的竞态覆盖 */
let version = 0
async function load() {
  const current = ++version
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchGoods({ ...query })
    if (current === version) {
      list.value = res.list
      total.value = res.total
    }
  } catch (e) {
    if (current === version) loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (current === version) loading.value = false
  }
}

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.category = ''
  query.status = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 上架 / 下架 */
async function onToggle(row: MallGoods) {
  acting.value = row.id
  /* 先取旧状态再调接口：接口原地更新了 row.status，后再判断会拿到新值导致提示反转 */
  const wasOn = row.status === 'on'
  try {
    await toggleGoodsStatus(row.id)
    MessagePlugin.success(wasOn ? '商品已下架，成员端不再可见' : '商品已重新上架')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 归档：仅已下架商品 */
async function onArchive(row: MallGoods) {
  acting.value = `${row.id}:archive`
  try {
    await archiveGoods(row.id)
    MessagePlugin.success('商品已归档，可在归档管理中恢复')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 新增 / 编辑商品 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const currentGoods = ref<MallGoods | null>(null)

function openCreate() {
  formMode.value = 'create'
  currentGoods.value = null
  formVisible.value = true
}

function openEdit(row: MallGoods) {
  formMode.value = 'edit'
  currentGoods.value = row
  formVisible.value = true
}

/* 导出配置 */
const exportHeaders = ['编号', '商品名称', '类型', '所需积分', '库存', '累计兑换', '状态', '创建时间']

function mapRow(g: MallGoods): (string | number)[] {
  return [
    g.id,
    g.name,
    g.categoryLabel ?? goodsCategoryMap[g.category] ?? g.category,
    g.points,
    g.stock,
    g.redeemedCount,
    statusLabel('goods', g.status),
    g.createdAt,
  ]
}

const pageExportRows = computed(() => list.value.map(mapRow))

function fetchAllForExport(page: number, pageSize: number) {
  return fetchGoods({ ...query, page, pageSize })
}

const { syncQuery } = useListQueryState(query, load)

onMounted(() => {
  load()
  void loadCategories()
})

/** 类别下拉（含「商品类别」弹窗保存后的刷新）：取字典启用项 */
async function loadCategories() {
  try {
    const entries = await fetchDictEntries('goods_category')
    const options = entries
      .filter((e) => e.status === 'enabled')
      .map((e) => ({ label: e.label, value: e.code }))
    if (options.length) categoryOptions.value = [{ label: '全部', value: '' }, ...options]
  } catch {
    /* 字典不可用时保留本地兜底选项 */
  }
}
</script>

<template>
  <div class="goods-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="商品管理" description="积分商品的新增、上下架与库存维护">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="mall-goods"
          :columns="dataColumns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <ExportButton
          filename="商品列表"
          :headers="exportHeaders"
          :rows="pageExportRows"
          :fetch-all="fetchAllForExport"
          :map-row="mapRow"
        />
        <t-button variant="outline" @click="categoryDialogVisible = true">
          <template #icon><ViewListIcon /></template>
          商品类别
        </t-button>
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增商品
        </t-button>
      </template>
    </PageHeader>

    <GoodsCategoryDialog v-model:visible="categoryDialogVisible" @success="loadCategories" />

    <div class="page-filter-bar">
      <t-input class="ctl-w-xl"
        v-model="query.keyword"
        placeholder="搜索商品名称/编号…"
        clearable
        @enter="onSearch"
      />
      <t-select class="ctl-w-md"
        v-model="query.category"
        label="类型"
        :options="categoryOptions"
        clearable
        @change="onSearch"
      />
      <t-select class="ctl-w-sm"
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        @change="onSearch"
      />
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
        重置
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
  :pagination="pagination"
  @page-change="onPageChange"
  >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <div class="cell-sub">{{ row.id }}</div>
        </template>
        <template #category="{ row }">
          <!-- 类型名称由后端按字典回填 categoryLabel，硬编码词表仅作兜底（历史 physical/voucher 值） -->
          <t-tag variant="light">{{ row.categoryLabel ?? goodsCategoryMap[row.category] ?? row.category }}</t-tag>
        </template>
        <template #stock="{ row }">
          <span :class="{ 'stock-out': row.stock === 0 }">{{ row.stock }}</span>
        </template>
        <template #status="{ row }">
          <StatusTag entity="goods" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
            <t-popconfirm
              v-if="row.status === 'on'"
              content="确认下架该商品？下架后成员端不可兑换"
              @confirm="onToggle(row)"
            >
              <t-button variant="text" size="small" theme="warning" :loading="acting === row.id">
                下架
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
              上架
            </t-button>
            <!-- 归档可恢复，非不可逆删除：语义色与订单页统一为 warning -->
            <t-popconfirm
              v-if="row.status === 'off'"
              content="确认归档该商品？归档后可在归档管理中恢复"
              @confirm="onArchive(row)"
            >
              <t-button
                variant="text"
                size="small"
                theme="warning"
                :loading="acting === row.id + ':archive'"
              >
                归档
              </t-button>
            </t-popconfirm>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="query" description="暂无商品" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <GoodsFormDialog v-model:visible="formVisible" :mode="formMode" :goods="currentGoods" @success="load" />
  </div>
</template>

<style scoped>
.stock-out {
  color: var(--td-error-color);
  font-weight: 600;
}
</style>
