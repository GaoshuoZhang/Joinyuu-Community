<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RefreshIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { fetchMallPointsRecords } from '@/api/mall'
import { fetchUserOptions } from '@/api/users'
import type { PointsRecord } from '@/types'

/* 积分流水面板：全量积分流水（与用户详情流水同源），顶部汇总发放/消耗 */
const loading = ref(false)
const list = ref<PointsRecord[]>([])
const userLabels = ref<Record<string, string>>({})

const columns = [
  { colKey: 'id', title: '流水号', width: 110 },
  { colKey: 'user', title: '用户', cell: 'user', width: 160 },
  { colKey: 'delta', title: '变动', cell: 'delta', width: 90, resizable: true },
  { colKey: 'balance', title: '变动后余额', width: 110, resizable: true },
  { colKey: 'reason', title: '事由', ellipsis: true },
  { colKey: 'at', title: '时间', width: 150, resizable: true },
  { colKey: 'operator', title: '操作人', width: 110, resizable: true },
]

const totalGranted = computed(() =>
  list.value.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0),
)
const totalSpent = computed(() =>
  list.value.filter((r) => r.delta < 0).reduce((s, r) => s + Math.abs(r.delta), 0),
)

async function load() {
  loading.value = true
  try {
    const [records, opts] = await Promise.all([fetchMallPointsRecords(), fetchUserOptions()])
    list.value = records
    const map: Record<string, string> = {}
    for (const o of opts) map[o.value] = o.label
    userLabels.value = map
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="ledger-panel page-fade-in">
    <PageHeader title="积分账单" description="全量积分流水查询与发放/消耗汇总（与用户详情积分流水同源）" />

    <div class="stat-row">
      <StatCard label="累计发放" :value="totalGranted" />
      <StatCard label="累计兑换消耗" :value="totalSpent" />
      <StatCard label="流水笔数" :value="list.length" />
    </div>

    <div class="page-filter-bar">
      <span class="panel-tip">与用户详情积分流水同源；兑换扣减与订单取消退回均记录在此。</span>
      <t-button variant="outline" style="margin-left: auto" @click="load">
        <template #icon><RefreshIcon /></template>
        刷新
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
        empty="暂无积分流水"
      >
        <template #user="{ row }">{{ userLabels[row.userId] ?? row.userId }}</template>
        <template #delta="{ row }">
          <span :class="row.delta > 0 ? 'delta-add' : 'delta-sub'">
            {{ row.delta > 0 ? `+${row.delta}` : row.delta }}
          </span>
        </template>
      </t-table>
    </div>
  </div>
</template>

<style scoped>
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.panel-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.delta-add {
  color: var(--td-success-color);
  font-weight: 600;
}

.delta-sub {
  color: var(--td-error-color);
  font-weight: 600;
}
</style>
