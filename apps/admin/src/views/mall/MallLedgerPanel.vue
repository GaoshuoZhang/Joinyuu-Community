<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RefreshIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { fetchPointsIssuanceRecords } from '@/api/mall'
import { fetchUserOptions } from '@/api/users'
import type { PointsRecord } from '@/types'

/* 积分发放记录面板：仅展示系统按积分规则自动发放的记录（手动调整/兑换扣减不在此列） */
const loading = ref(false)
const list = ref<PointsRecord[]>([])
const userLabels = ref<Record<string, string>>({})

const columns = [
  { colKey: 'id', title: '流水号', width: 110 },
  { colKey: 'user', title: '用户', cell: 'user', width: 160 },
  { colKey: 'delta', title: '变动', cell: 'delta', width: 90, resizable: true },
  { colKey: 'balance', title: '变动后余额', width: 110, resizable: true },
  { colKey: 'reason', title: '事由', ellipsis: true },
  { colKey: 'at', title: '时间', width: 160, resizable: true },
]

const totalGranted = computed(() =>
  list.value.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0),
)

async function load() {
  loading.value = true
  try {
    const [records, opts] = await Promise.all([fetchPointsIssuanceRecords(), fetchUserOptions()])
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
    <PageHeader title="积分发放记录" description="系统按积分规则自动发放的积分记录（发放自动，扣除为管理员手动调整）" />

    <div class="stat-row">
      <StatCard label="累计发放" :value="totalGranted" />
      <StatCard label="发放笔数" :value="list.length" />
      <StatCard label="覆盖用户数" :value="new Set(list.map((r) => r.userId)).size" />
    </div>

    <div class="page-filter-bar">
      <span class="panel-tip">仅记录规则自动发放；管理员手动调整与商城兑换扣减不在此列。</span>
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
        empty="暂无发放记录"
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
