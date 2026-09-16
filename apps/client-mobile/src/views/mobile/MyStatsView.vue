<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Loading } from 'tdesign-mobile-vue'
import { fetchMyStats } from '@/api/me'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* v42 个人数据看板：积分收支与参与度汇总（Mock；接入期接 /api/app/me/stats）。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyStats)
onMounted(run)
</script>

<template>
  <div class="page-fade-in stats-page">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="data">
      <section class="m-card points-card">
        <div class="points-item">
          <span class="points-label">累计获得</span>
          <b class="points-value">+{{ data.pointsEarned }}</b>
        </div>
        <div class="points-item">
          <span class="points-label">累计消耗</span>
          <b class="points-value spent">-{{ data.pointsSpent }}</b>
        </div>
      </section>

      <section class="grid">
        <article class="m-card cell" v-pressable @click="router.push('/me/demands')">
          <b>{{ data.demands }}</b><span>发布需求</span>
        </article>
        <article class="m-card cell" v-pressable @click="router.push('/me/responses')">
          <b>{{ data.responses }}</b><span>响应需求</span>
        </article>
        <article class="m-card cell" v-pressable @click="router.push('/me/enrollments')">
          <b>{{ data.enrollments }}</b><span>活动报名</span>
        </article>
        <article class="m-card cell" v-pressable @click="router.push('/me/articles')">
          <b>{{ data.articles }}</b><span>投稿内容</span>
        </article>
        <article class="m-card cell" v-pressable @click="router.push('/me/projects')">
          <b>{{ data.projects }}</b><span>参与项目</span>
        </article>
        <article class="m-card cell" v-pressable @click="router.push('/me/orders')">
          <b>{{ data.orders }}</b><span>兑换订单</span>
        </article>
      </section>

      <p class="footnote">数据统计自当前 Mock 状态；接入真实接口后按服务端口径更新。</p>
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
}

.points-value.spent {
  color: var(--td-text-color-secondary);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.cell b {
  font-size: 20px;
}

.cell span {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.footnote {
  margin: 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
</style>
