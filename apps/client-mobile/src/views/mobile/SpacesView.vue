<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { fetchSpaces } from '@/api/spaces'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'

useAnimSuppress()

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchSpaces)
onMounted(run)

/* v38：返回时刷新空间列表 */
useRefreshOnActivate(run)
</script>

<template>
  <div class="page page-fade-in">
    <h2 class="title">可预约空间</h2>
    <ListSkeleton v-if="loading && !(data ?? []).length" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!data?.length" text="暂无可预约空间" />
    <div v-else class="list stagger">
      <p class="list-count">共 {{ data?.length }} 个空间</p>
      <article v-for="s in data" :key="s.id" class="m-card">
        <h3 class="name">{{ s.name }}</h3>
        <p class="meta">📍 {{ s.location }} · 容纳 {{ s.capacity }} 人 · 🕐 {{ s.openTime }}-{{ s.closeTime }}</p>
        <div class="equip">
          <span v-for="e in s.equipment" :key="e" class="chip">{{ e }}</span>
          <span class="chip approval">{{ s.needApproval ? '需审核' : '免审核' }}</span>
          <span v-if="s.status === 'maintenance'" class="chip maintenance">维护中</span>
        </div>
        <Button
          theme="primary"
          block
          :disabled="s.status === 'maintenance'"
          @click="router.push(`/spaces/${s.id}/reserve`)"
        >
          {{ s.status === 'maintenance' ? '维护中，暂不可预约' : '预约' }}
        </Button>
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
.chip.maintenance { color: var(--td-warning-color); border-color: var(--td-warning-color); }
.chip { font-size: 12px; padding: 2px 8px; border-radius: var(--td-tag-square-border-radius, 4px); background: var(--td-bg-color-page); border: 1px solid var(--td-component-border); color: var(--td-text-color-secondary); }
.chip.approval { background: var(--td-brand-color-1); color: var(--td-brand-color); border: none; }
</style>
