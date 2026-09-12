<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'
import { fetchMyDemands } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyDemands)

onMounted(run)

const items = computed(() => data.value ?? [])
</script>

<template>
  <div class="m-my-demands page-fade-in">
    <Button theme="primary" block class="publish" @click="router.push('/demands/new')">发布需求</Button>

    <div v-if="loading" class="hint">加载中…</div>
    <EmptyBlock v-else-if="error" :text="error" />
    <template v-else-if="items.length === 0">
      <EmptyBlock text="暂无需求，去发布第一条" />
      <Button theme="primary" block @click="router.push('/demands/new')">发布需求</Button>
    </template>
    <div v-else class="list stagger">
      <article v-for="d in items" :key="d.id" class="demand-row m-card">
        <div class="row-head">
          <h3 class="row-title">{{ d.title }}</h3>
          <StateTag kind="demand" :value="d.status" />
        </div>
        <div class="row-meta">
          <span class="cat">{{ d.categoryLabel }}</span>
          <span>{{ d.responseCount }} 人响应</span>
        </div>
        <p class="row-time">发布于 {{ d.createdAt }}</p>
        <p v-if="d.rejectReason" class="reject">驳回原因：{{ d.rejectReason }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.m-my-demands {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hint {
  padding: 20px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  text-align: center;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.row-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
}

.row-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--td-text-color-secondary);
}

.cat {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.row-time {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.reject {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}
</style>
