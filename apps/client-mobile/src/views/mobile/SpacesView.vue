<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Loading } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchSpaces } from '@/api/spaces'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchSpaces)
onMounted(run)
</script>

<template>
  <div class="page page-fade-in">
    <h2 class="title">可预约空间</h2>
    <Loading v-if="loading" class="state" text="加载中…" />
    <div v-else-if="error" class="tip danger">{{ error }}</div>
    <EmptyBlock v-else-if="!data?.length" text="暂无可预约空间" />
    <div v-else class="list stagger">
      <article v-for="s in data" :key="s.id" class="m-card">
        <h3 class="name">{{ s.name }}</h3>
        <p class="meta">📍 {{ s.location }} · 容纳 {{ s.capacity }} 人 · 🕐 {{ s.openTime }}-{{ s.closeTime }}</p>
        <div class="equip">
          <span v-for="e in s.equipment" :key="e" class="chip">{{ e }}</span>
          <span class="chip approval">{{ s.needApproval ? '需审批' : '免审批' }}</span>
        </div>
        <Button theme="primary" block @click="router.push(`/spaces/${s.id}/reserve`)">预约</Button>
      </article>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 16px; }
.title { margin: 0 0 12px; font-size: 17px; }
.tip { padding: 20px; color: var(--td-text-color-placeholder); font-size: 12px; background: var(--td-bg-color-container); border-radius: var(--td-radius-large); }
.tip.danger { color: var(--td-error-color); }
.list { display: flex; flex-direction: column; gap: 12px; }
.name { margin: 0 0 6px; font-size: 15px; }
.meta { margin: 0 0 8px; font-size: 12px; color: var(--td-text-color-secondary); }
.equip { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.chip { font-size: 12px; padding: 2px 8px; border-radius: var(--td-radius-small); background: var(--td-bg-color-page); border: 1px solid var(--td-component-border); color: var(--td-text-color-secondary); }
.chip.approval { background: var(--td-brand-color-1); color: var(--td-brand-color); border: none; }
</style>
