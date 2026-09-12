<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Loading } from 'tdesign-mobile-vue'
import { fetchMyResponses } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyResponses)

onMounted(run)

const items = computed(() => data.value ?? [])
</script>

<template>
  <div class="m-my-responses page-fade-in">
    <h1 class="title">我的响应</h1>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <EmptyBlock v-else-if="items.length === 0" text="暂无响应记录" />
    <div v-else class="list stagger">
      <article v-for="r in items" :key="r.id" class="resp-row m-card" @click="router.push(`/demands/${r.demandId}`)">
        <p class="row-title">{{ r.demandTitle }}</p>
        <p class="row-note">{{ r.note }}</p>
        <p class="row-at">响应于 {{ r.at }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.m-my-responses {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 18px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.resp-row {
  cursor: pointer;
}

.row-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
}

.row-note {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.row-at {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
