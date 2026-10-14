<script setup lang="ts">
import ListErrorState from '@/components/ListErrorState.vue'
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { fetchExperienceIssuanceRecords } from '@/api/rules'
import { fetchEnterpriseOptions } from '@/api/enterprises'
import { fetchUserOptions } from '@/api/users'
import type { ExperienceRecord } from '@/types'

/* 经验值发放记录面板：仅展示系统按经验值规则自动发放的记录（手动调整/扣减不在此列） */
const loading = ref(false)
const loadError = ref('')
const list = ref<ExperienceRecord[]>([])
const nameLabels = ref<Record<string, string>>({})

/* 选项 label 形如「名称（ID）」，展示时拆出名称，ID 以标签单独呈现；映射未命中显示「未知用户/未知企业」 */
function displayName(id: string, targetType: 'enterprise' | 'individual'): string {
  const label = nameLabels.value[id]
  if (!label) return targetType === 'enterprise' ? '未知企业' : '未知用户'
  return label.replace(/（[^）]*）\s*$/, '')
}

const columns = [
  { colKey: 'id', title: '流水号', width: 110 , ellipsis: true},
  { colKey: 'target', title: '归属', cell: 'target', width: 200, resizable: true , ellipsis: true},
  { colKey: 'exp', title: '经验值', cell: 'exp', width: 100, resizable: true , ellipsis: true},
  /* 事由文案长度不定：显式声明列宽，避免固定布局下按内容撑开列 */
  { colKey: 'reason', title: '事由', width: 240, ellipsis: true },
  { colKey: 'at', title: '时间', width: 170, resizable: true , ellipsis: true},
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

/* 累计发放口径与积分发放记录一致：只累加正数（扣减不计入发放量） */
const totalGranted = computed(() =>
  list.value.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0),
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
  <div class="exp-records-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="经验值发放记录" description="系统按经验值规则自动发放的经验值记录（发放自动，扣除为管理员手动调整）" />

    <div class="stat-row stat-row--3">
      <StatCard label="累计发放" :value="totalGranted" />
      <StatCard label="发放笔数" :value="list.length" />
      <StatCard label="覆盖归属数" :value="new Set(list.map((r) => r.targetId)).size" />
    </div>

    <!-- 纯说明文案不是筛选条件：用 info 提示条承载（与 ExperienceRulesPanel 口径一致） -->
    <t-alert theme="info" class="records-note">
      仅记录规则自动发放（企业经验值挂靠社区企业身份，个人经验值挂靠社区个体身份）；管理员手动调整与扣减不在此列。
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
        <template #target="{ row }">
          <div class="target-cell">
            <t-tag
              :theme="row.targetType === 'enterprise' ? 'primary' : 'default'"
              variant="light"
              size="small"
            >
              {{ row.targetType === 'enterprise' ? '企业' : '个人' }}
            </t-tag>
            <span class="target-name">{{ displayName(row.targetId, row.targetType) }}<t-tag v-if="row.targetId" class="id-tag" size="small" variant="light">{{ row.targetId }}</t-tag></span>
          </div>
        </template>
        <template #exp="{ row }">
          <!-- 正数显式带 +，负数原样展示（对齐 MallLedgerPanel 口径） -->
          <span class="exp-add">{{ row.delta > 0 ? `+${row.delta}` : row.delta }}</span>
        </template>
      </t-table>
    </div>
  </div>
</template>

<style scoped>
.records-note {
  margin-bottom: 16px;
}

.target-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.exp-add {
  color: var(--td-success-color);
  font-weight: 600;
}
</style>
