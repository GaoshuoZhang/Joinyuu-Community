<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Icon, NoticeBar, Tag } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useConfigStore } from '@/stores/config'
import { fetchSpaces } from '@/api/spaces'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { formatZhNumber } from '@/utils/format'

useAnimSuppress()

const router = useRouter()
const config = useConfigStore()
void config.ensureLoaded()
/* 空间预约开关关闭时提示且禁用预约入口（D-007/D-008 前端层） */
const reservationOpen = computed(() => config.config.reservationOpen)
const { data, loading, error, run } = useAsyncList(fetchSpaces)
onMounted(run)

/* v38：返回时刷新空间列表 */
useRefreshOnActivate(run)
</script>

<template>
  <div class="page page-fade-in">
    <h1 class="title">可预约空间</h1>
    <NoticeBar v-if="!reservationOpen" visible theme="warning" content="空间预约暂未开放，可先浏览空间信息。" class="closed-tip" />
    <ListSkeleton v-if="loading && !(data ?? []).length" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!data?.length" text="暂无可预约空间" />
    <div v-else class="list stagger">
      <p class="list-count">共 {{ formatZhNumber(data?.length ?? 0) }} 个空间</p>
      <article v-for="s in data" :key="s.id" class="m-card">
        <h2 class="name">{{ s.name }}</h2>
        <p class="meta">
          <span class="meta-item"><Icon aria-hidden="true" name="location" size="14px" />{{ s.location }}</span>
          <span class="meta-item">容纳 {{ formatZhNumber(s.capacity) }} 人</span>
          <span class="meta-item"><Icon aria-hidden="true" name="time" size="14px" />{{ s.openTime }}-{{ s.closeTime }}</span>
        </p>
        <div class="equip">
          <!-- v51：收费是中性信息（此前用 warning 语义色，暗示异常）；改为中性品牌色，「免费」保留正向语义 -->
          <Tag size="small" variant="light" :theme="s.feePerHour > 0 ? 'primary' : 'success'">
            {{ s.feePerHour > 0 ? `${s.feePerHour} 积分/小时` : '免费' }}
          </Tag>
          <Tag v-for="e in s.equipment" :key="e" size="small" variant="light" theme="default">{{ e }}</Tag>
          <Tag size="small" variant="light" theme="primary">{{ s.needApproval ? '需审核' : '免审核' }}</Tag>
          <StateTag v-if="s.status === 'maintenance'" kind="space" value="maintenance" />
        </div>
        <Button
          theme="primary"
          variant="outline"
          block
          :disabled="s.status === 'maintenance' || !reservationOpen"
          @click="router.push(`/spaces/${s.id}/reserve`)"
        >
          {{ !reservationOpen ? '预约暂未开放' : s.status === 'maintenance' ? '维护中，暂不可预约' : '查看可约时段' }}
        </Button>
      </article>
    </div>
  </div>
</template>

<style scoped>
.page { padding:var(--app-space-8); }
.title { margin:0 0 var(--app-space-6); font: var(--app-type-page-title); }
.closed-tip { margin-bottom: var(--app-space-5); }
.tip { padding:var(--app-space-10); color: var(--td-text-color-placeholder); font: var(--app-type-body-sm); background: var(--td-bg-color-container); border-radius: var(--td-radius-large); }
.tip.danger { color: var(--td-error-color); }
.list { display: flex; flex-direction: column; gap:var(--app-space-6); }
.name { margin:0 0 var(--app-space-3); font: var(--app-type-card-title); }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap:var(--app-space-5); margin:0 0 var(--app-space-4); font: var(--app-type-caption); color: var(--td-text-color-secondary); }
.meta-item { display: inline-flex; align-items: center; gap:var(--app-space-2); }
.equip { display: flex; flex-wrap: wrap; gap:var(--app-space-3); margin-bottom:var(--app-space-6); }
</style>
