<script setup lang="ts">
import { onMounted } from 'vue'
import { Loading } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchMyReservations } from '@/api/spaces'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

const { data, loading, error, run } = useAsyncList(fetchMyReservations)
onMounted(run)
</script>

<template>
  <div class="page-fade-in my-reservations">
    <h2 class="page-title">我的预约</h2>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <EmptyBlock v-else-if="!data?.length" text="暂无预约记录" />
    <div v-else class="stagger list">
      <article v-for="r in data" :key="r.id" class="m-card">
        <div class="row">
          <h3 class="name">{{ r.spaceName }}</h3>
          <StateTag kind="reservation" :value="r.status" />
        </div>
        <p class="meta">📅 {{ r.date }} · {{ r.start }} - {{ r.end }} · 提交于 {{ r.createdAt }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.my-reservations {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-title {
  margin: 0;
  padding: 0 2px;
  font-size: 18px;
}

.state {
  padding: 20px 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.name {
  margin: 0;
  font-size: 14px;
  min-width: 0;
}

.meta {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--td-text-color-secondary);
}
</style>
