<script setup lang="ts">
import ListErrorState from '@/components/ListErrorState.vue'
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { fetchPointsIssuanceRecords } from '@/api/mall'
import { fetchUserOptions } from '@/api/users'
import type { PointsRecord } from '@/types'

/* 积分发放记录面板：仅展示系统按积分规则自动发放的记录（手动调整/兑换扣减不在此列） */
const loading = ref(false)
const loadError = ref('')
const list = ref<PointsRecord[]>([])
const userLabels = ref<Record<string, string>>({})

/* 选项 label 形如「昵称（UID）」，展示时拆出名称，ID 以标签单独呈现；映射未命中显示「未知用户」 */
function displayName(id: string): string {
  const label = userLabels.value[id]
  if (!label) return '未知用户'
  return label.replace(/（[^）]*）\s*$/, '')
}

const columns = [
  { colKey: 'id', title: '流水号', width: 110 , ellipsis: true},
  { colKey: 'user', title: '用户', cell: 'user', width: 160 , ellipsis: true},
  { colKey: 'delta', title: '变动', cell: 'delta', width: 90, resizable: true , ellipsis: true},
  { colKey: 'balance', title: '变动后余额', width: 110, resizable: true , ellipsis: true},
  { colKey: 'reason', title: '事由', ellipsis: true },
  { colKey: 'at', title: '时间', width: 160, resizable: true , ellipsis: true},
]

/* 前端分页：全量数据交由 t-table 内置分页本地切片（每页 20） */
const page = ref(1)
const pagination = computed(() => ({
  current: page.value,
  pageSize: 20,
  total: list.value.length,
  showPageSize: false,
}))

function onPageChange(p: { current: number }) {
  page.value = p.current
}

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
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="ledger-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="积分发放记录" description="系统按积分规则自动发放的积分记录（发放自动，扣除为管理员手动调整）" />

    <div class="stat-row stat-row--3">
      <StatCard label="累计发放" :value="totalGranted" />
      <StatCard label="发放笔数" :value="list.length" />
      <StatCard label="覆盖用户数" :value="new Set(list.map((r) => r.userId)).size" />
    </div>

    <!-- 纯说明文案不是筛选条件：用 info 提示条承载（与 MallRulesPanel 口径一致） -->
    <t-alert theme="info" class="ledger-note">
      仅记录规则自动发放；管理员手动调整与商城兑换扣减不在此列。
    </t-alert>

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
        empty="暂无发放记录"
        @page-change="onPageChange"
      >
        <template #user="{ row }">
          {{ displayName(row.userId) }}<t-tag v-if="row.userId" class="id-tag" size="small" variant="light">{{ row.userId }}</t-tag>
        </template>
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
.ledger-note {
  margin-bottom: 16px;
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
