<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Grid, GridItem } from 'tdesign-mobile-vue'
import { fetchMyStats } from '@/api/me'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { formatZhNumber } from '@/utils/format'

/* 个人数据看板：积分收支与参与度汇总。 */
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

</script>

<template>
  <div class="page-fade-in stats-page">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="data">
      <section class="m-card points-card">
        <div class="points-item">
          <span class="points-label">累计获得</span>
          <b class="points-value">+{{ formatZhNumber(data.pointsEarned) }}</b>
        </div>
        <div class="points-item">
          <span class="points-label">累计消耗</span>
          <b class="points-value spent">-{{ formatZhNumber(data.pointsSpent) }}</b>
        </div>
      </section>

      <Grid :column="2" align="left" class="stats-grid">
        <GridItem
          v-for="cell in statCells"
          :key="cell.key"
          class="stat-cell"
          :class="{ linkable: cell.path }"
          v-pressable="Boolean(cell.path)"
          @click="cell.path && router.push(cell.path)"
        >
          <!-- v45：数值改由 text 槽承载，避免塞进 48×48 的 image 槽被折行挤压 -->
          <template #text><b class="stat-value">{{ formatZhNumber(cell.value) }}</b></template>
          <template #description>{{ cell.label }}</template>
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
  gap:var(--app-space-6);
  padding:var(--app-space-8);
}

.points-card {
  display: flex;
  gap:var(--app-space-6);
}

.points-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap:var(--app-space-2);
}

.points-label {
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.points-value {
  font: var(--app-type-numeric-lg);
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-brand);
}

.points-value.spent {
  color: var(--td-text-color-secondary);
}

/* 宫格不传 gutter：官方会把 gutter 写成根节点内联 padding/gap，使宫格四周多出内缩、与
 * 其它卡片左边缘不齐；间距改由下面这条 gap 统一控制（内联值无效被忽略，无需 !important）。 */
.stats-grid {
  gap: var(--app-space-6);
}

.stat-cell {
  --td-grid-item-bg-color: var(--td-bg-color-container);
  --td-grid-item-image-bg-color: transparent;
  /* 无图项：image 槽留空时官方仍渲染 48×48 容器，压成 0 消除空档 */
  --td-grid-item-image-width: 0;

  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
  padding:var(--app-space-6) var(--app-space-7);
  align-items: flex-start;
  text-align: left;
}

.stat-cell.linkable {
  cursor: pointer;
}

.stat-value {
  font: var(--app-type-numeric-lg);
  font-variant-numeric: tabular-nums;
}

.footnote {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}
</style>
