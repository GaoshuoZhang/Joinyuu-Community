<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RefreshIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { fetchExperienceIssuanceRecords } from '@/api/rules'
import { fetchEnterpriseOptions } from '@/api/enterprises'
import { fetchUserOptions } from '@/api/users'
import type { ExperienceRecord } from '@/types'

/* 经验值发放记录面板：仅展示系统按经验值规则自动发放的记录（手动调整/扣减不在此列） */
const loading = ref(false)
const list = ref<ExperienceRecord[]>([])
const nameLabels = ref<Record<string, string>>({})

const columns = [
  { colKey: 'id', title: '流水号', width: 110 },
  { colKey: 'target', title: '归属', cell: 'target', minWidth: 200, resizable: true },
  { colKey: 'exp', title: '经验值', cell: 'exp', width: 100, resizable: true },
  { colKey: 'reason', title: '事由', ellipsis: true },
  { colKey: 'at', title: '时间', width: 160, resizable: true },
]

const totalGranted = computed(() =>
  list.value.reduce((s, r) => s + r.delta, 0),
)

async function load() {
  loading.value = true
  try {
    const [records, userOpts, entOpts] = await Promise.all([
      fetchExperienceIssuanceRecords(),
      fetchUserOptions(),
      fetchEnterpriseOptions(),
    ])
    list.value = records
    const map: Record<string, string> = {}
    for (const o of userOpts) map[o.value] = o.label
    for (const o of entOpts) map[o.value] = o.label
    nameLabels.value = map
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="exp-records-panel page-fade-in">
    <PageHeader title="经验值发放记录" description="系统按经验值规则自动发放的经验值记录（发放自动，扣除为管理员手动调整）" />

    <div class="stat-row">
      <StatCard label="累计发放" :value="totalGranted" />
      <StatCard label="发放笔数" :value="list.length" />
      <StatCard label="覆盖归属数" :value="new Set(list.map((r) => r.targetId)).size" />
    </div>

    <div class="page-filter-bar">
      <span class="panel-tip">仅记录规则自动发放（企业经验挂靠社区企业身份，个人经验挂靠社区个体身份）；管理员手动调整与扣减不在此列。</span>
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
        <template #target="{ row }">
          <div class="target-cell">
            <t-tag
              :theme="row.targetType === 'enterprise' ? 'primary' : 'default'"
              variant="light"
              size="small"
            >
              {{ row.targetType === 'enterprise' ? '企业' : '个人' }}
            </t-tag>
            <span class="target-name">{{ nameLabels[row.targetId] ?? row.targetId }}</span>
          </div>
        </template>
        <template #exp="{ row }">
          <span class="exp-add">+{{ row.delta }}</span>
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

.target-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-name {
  font-size: 13px;
  color: var(--td-text-color-primary);
}

.exp-add {
  color: var(--td-brand-color);
  font-weight: 600;
}
</style>
