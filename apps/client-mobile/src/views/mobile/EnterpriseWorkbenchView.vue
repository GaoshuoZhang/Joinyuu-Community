<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Loading, Tag } from 'tdesign-mobile-vue'
import { fetchEnterpriseWorkbench } from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* v42 企业工作台：企业名义响应记录与经营入口（Mock；接入期接 /api/app/enterprises/:id/workbench）。 */
const route = useRoute()
const router = useRouter()
const enterpriseId = String(route.params.id)
const { data, loading, error, run } = useAsyncList(() => fetchEnterpriseWorkbench(enterpriseId))
onMounted(run)
</script>

<template>
  <div class="page-fade-in bench-page">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else>
      <section class="m-card summary">
        <div class="summary-item">
          <b>{{ data?.responseCount ?? 0 }}</b>
          <span>企业名义响应</span>
        </div>
      </section>

      <section class="m-card">
        <h3 class="section-title">快捷入口</h3>
        <div class="links">
          <Button size="small" variant="outline" @click="router.push(`/me/enterprises/${enterpriseId}`)">企业详情</Button>
          <Button size="small" variant="outline" @click="router.push(`/me/enterprises/${enterpriseId}/edit`)">编辑企业名片</Button>
          <Button size="small" variant="outline" @click="router.push('/projects')">代企业响应需求</Button>
        </div>
      </section>

      <section class="m-card">
        <h3 class="section-title">最近响应</h3>
        <EmptyBlock v-if="!(data?.recentResponses ?? []).length" text="暂无企业名义的响应记录" />
        <div v-else class="list">
          <article v-for="r in data?.recentResponses" :key="r.id" class="resp" v-pressable @click="router.push(`/demands/${r.demandId}/messages`)">
            <p class="resp-title">{{ r.demandTitle }}</p>
            <Tag size="small" variant="light">沟通中</Tag>
            <p class="resp-at">{{ r.at }}</p>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.bench-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.summary {
  display: flex;
  gap: 12px;
}

.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-item b {
  font-size: 22px;
  color: var(--td-brand-color);
}

.summary-item span {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.section-title {
  margin: 0 0 8px;
  font-size: 14px;
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.resp {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--td-component-border);
  cursor: pointer;
}

.resp:last-child {
  border-bottom: none;
}

.resp-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resp-at {
  margin: 0;
  width: 100%;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
</style>
