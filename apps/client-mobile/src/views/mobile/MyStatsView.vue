<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Grid, GridItem, Loading } from 'tdesign-mobile-vue'
import { fetchMyStats } from '@/api/me'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* v42 个人数据看板：积分收支与参与度汇总（Mock；接入期接 /api/app/me/stats）。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyStats)
onMounted(run)

interface StatCell {
  key: string
  label: string
  value: number
  path?: string
}

const statCells = computed<StatCell[]>(() => {
  const d = data.value
  if (!d) return []
  const cells: (StatCell | null)[] = [
    d.experience !== undefined ? { key: 'experience', label: '个人经验值', value: d.experience } : null,
    d.checkedIn !== undefined ? { key: 'checkedIn', label: '活动签到', value: d.checkedIn } : null,
    { key: 'demands', label: '发布需求', value: d.demands, path: '/me/demands' },
    { key: 'responses', label: '响应需求', value: d.responses, path: '/me/responses' },
    { key: 'enrollments', label: '活动报名', value: d.enrollments, path: '/me/enrollments' },
    { key: 'articles', label: '投稿内容', value: d.articles, path: '/me/articles' },
    { key: 'projects', label: '参与项目', value: d.projects, path: '/me/projects' },
    { key: 'orders', label: '兑换订单', value: d.orders, path: '/me/orders' },
  ]
  return cells.filter((cell): cell is StatCell => cell !== null)
})

function formatCount(value: number): string {
  return value.toLocaleString('zh-CN')
}
</script>

<template>
  <div class="page-fade-in stats-page">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="data">
      <section class="m-card points-card">
        <div class="points-item">
          <span class="points-label">累计获得</span>
          <b class="points-value">+{{ formatCount(data.pointsEarned) }}</b>
        </div>
        <div class="points-item">
          <span class="points-label">累计消耗</span>
          <b class="points-value spent">-{{ formatCount(data.pointsSpent) }}</b>
        </div>
      </section>

      <Grid :column="2" :gutter="10">
        <GridItem
          v-for="cell in statCells"
          :key="cell.key"
          class="stat-cell"
          :class="{ linkable: cell.path }"
          v-pressable="Boolean(cell.path)"
          @click="cell.path && router.push(cell.path)"
        >
          <template #image>
            <b class="stat-value">{{ formatCount(cell.value) }}</b>
          </template>
          <template #text>{{ cell.label }}</template>
        </GridItem>
      </Grid>

      <p class="footnote">统计累计积分流水及业务记录；已取消的记录仍计入历史参与次数。</p>
    </template>
  </div>
</template>

<style scoped>
.stats-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.points-card {
  display: flex;
  gap: 12px;
}

.points-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.points-label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.points-value {
  font-size: 24px;
  color: var(--td-brand-color);
  font-variant-numeric: tabular-nums;
}

.points-value.spent {
  color: var(--td-text-color-secondary);
}

.stat-cell {
  --td-grid-item-bg-color: var(--td-bg-color-container);
  --td-grid-item-image-bg-color: transparent;

  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
  padding: 12px 14px;
  align-items: flex-start;
  text-align: left;
}

.stat-cell.linkable {
  cursor: pointer;
}

.stat-value {
  font-size: 20px;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.footnote {
  margin: 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
</style>
