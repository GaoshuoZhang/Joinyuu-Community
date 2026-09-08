<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import GoodsFormDialog from '@/components/GoodsFormDialog.vue'
import { fetchGoods, toggleGoodsStatus } from '@/api/mall'
import { goodsCategoryMap } from '@/constants/status'
import type { MallGoods } from '@/types'

/* 商品管理面板：列表 + 上架/下架 + 创建/编辑（创建即上架） */
const loading = ref(false)
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

const categoryOptions = [
  { label: '全部', value: '' },
  ...Object.entries(goodsCategoryMap).map(([value, label]) => ({ label, value })),
]

const statusOptions = [
  { label: '全部', value: '' },
  { label: '已上架', value: 'on' },
  { label: '已下架', value: 'off' },
]

const columns = [
  { colKey: 'name', title: '商品', cell: 'name', minWidth: 220, resizable: true },
  { colKey: 'category', title: '类型', cell: 'category', width: 100, resizable: true },
  { colKey: 'points', title: '兑换积分', width: 100, resizable: true },
  { colKey: 'stock', title: '库存', cell: 'stock', width: 90, resizable: true },
  { colKey: 'redeemedCount', title: '累计兑换', width: 100, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true },
  { colKey: 'createdAt', title: '创建时间', width: 150, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 130 },
]

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  total: total.value,
  showJumper: true,
}))

async function load() {
  loading.value = true
  try {
    const res = await fetchGoods({ ...query })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
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
  try {
    await toggleGoodsStatus(row.id)
    MessagePlugin.success(row.status === 'on' ? '商品已下架，成员端不再可见' : '商品已重新上架')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 创建 / 编辑商品 */
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

onMounted(load)
</script>

<template>
  <div class="goods-panel page-fade-in">
    <PageHeader title="商品管理" description="积分商品的创建、上下架与库存维护（原积分商城·商品管理）" />

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        placeholder="搜索商品名称/编号"
        clearable
        style="width: 220px"
        @enter="onSearch"
      />
      <t-select
        v-model="query.category"
        label="类型"
        :options="categoryOptions"
        clearable
        style="width: 150px"
        @change="onSearch"
      />
      <t-select
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        style="width: 140px"
        @change="onSearch"
      />
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
        <template #icon><RefreshIcon /></template>
        重置
      </t-button>
      <t-button theme="primary" class="filter-tail" @click="openCreate">
        <template #icon><AddIcon /></template>
        上架商品
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
        :pagination="pagination"
        empty="暂无商品数据"
        @page-change="onPageChange"
      >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <div class="cell-sub">{{ row.id }}</div>
        </template>
        <template #category="{ row }">
          <t-tag variant="light">{{ goodsCategoryMap[row.category] ?? row.category }}</t-tag>
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
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.id">
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
          </div>
        </template>
      </t-table>
    </div>

    <GoodsFormDialog v-model:visible="formVisible" :mode="formMode" :goods="currentGoods" @success="load" />
  </div>
</template>

<style scoped>
.filter-tail {
  margin-left: auto;
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

.stock-out {
  color: var(--td-error-color);
  font-weight: 600;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}
</style>
