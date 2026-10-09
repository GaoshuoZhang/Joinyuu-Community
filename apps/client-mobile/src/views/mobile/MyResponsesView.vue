<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, List, Toast } from 'tdesign-mobile-vue'
import { fetchMyResponses, withdrawResponse } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'
import type { MyResponseItem } from '@/types'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyResponses)
const withdrawing = ref('')

onMounted(run)

const items = computed(() => data.value ?? [])
const { visibleItems, hasMore, showMore } = useIncrementalList(items)
const footerState = computed(() => (hasMore.value ? 'load-more' : ''))
function loadMore() {
  if (!hasMore.value) return
  showMore()
}
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}

/* status 优先：rejected 即便记录已带撤回/失效时间仍显示「已驳回」；
 * 仅当 status 为 closed（撤回写入）或无 status 时才按 withdrawnAt 显示「已撤回」。 */
function statusOf(item: MyResponseItem): string {
  if (item.status && item.status !== 'closed') return item.status
  return item.withdrawnAt ? 'withdrawn' : item.status ?? 'pending'
}

/* 待处理 / 待审核可撤回，其余（已选定/已驳回/已结束等）不可 */
function canWithdraw(item: MyResponseItem): boolean {
  const status = item.status ?? 'pending'
  return !item.withdrawnAt && (status === 'pending' || status === 'pending_review')
}

function onWithdraw(item: MyResponseItem) {
  const dialog = DialogPlugin.confirm({
    title: '撤回响应',
    content: '撤回后该响应不再计入发布者选择；如需求仍在进行中，可重新响应。',
    cancelBtn: '再想想',
    confirmBtn: '确认撤回',
    onConfirm: async () => {
      dialog.hide()
      withdrawing.value = item.id
      try {
        await withdrawResponse(item.id)
        Toast('响应已撤回')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '撤回失败，请稍后重试')
      } finally {
        withdrawing.value = ''
      }
    },
  })
}
</script>

<template>
  <div class="m-my-responses page-fade-in">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="items.length === 0" text="暂无响应记录，去需求广场看看适合你的合作机会" action-text="浏览需求" @action="router.push('/projects')" />
    <List v-else class="list stagger" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
      <p class="list-count">共 {{ formatZhNumber(items.length) }} 条</p>
      <article v-for="r in visibleItems" :key="r.id" class="resp-row m-card">
        <!-- v48：与 MyDemandsView 一致，主体用 router-link 承载跳转（语义强于 article + role="link"），
             撤回/重新响应按钮放在链接之外，避免嵌套可交互元素 -->
        <router-link class="resp-main" :to="`/demands/${r.demandId}`">
          <h2 class="row-title">{{ r.demandTitle }}</h2>
          <p class="row-note">{{ r.note }}</p>
          <p v-if="r.status || r.withdrawnAt" class="row-status">
            <StateTag kind="response" :value="statusOf(r)" />
            <span v-if="r.rejectReason" class="row-reject">驳回原因：{{ r.rejectReason }}</span>
          </p>
          <p class="row-at">响应于 {{ formatLocalDateTime(r.at) }}</p>
        </router-link>
        <div v-if="r.withdrawnAt" class="row-ops">
          <Button size="small" variant="outline" @click="router.push(`/demands/${r.demandId}`)">重新响应</Button>
        </div>
        <div v-else-if="canWithdraw(r)" class="row-ops">
          <Button size="small" variant="outline" theme="danger" :loading="withdrawing === r.id" @click="onWithdraw(r)">撤回响应</Button>
        </div>
      </article>
    </List>
  </div>
</template>

<style scoped>
.m-my-responses {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.row-title {
  margin: 0;
  font: var(--app-type-card-title);
}

/* v48：卡片主体用 router-link 承载跳转（与 MyDemandsView 的 .demand-main 同口径） */
.resp-main {
  display: block;
  color: inherit;
  text-decoration: none;
}

.row-ops {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--app-space-2);
}

.row-note {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.row-at {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.row-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap:var(--app-space-4);
  margin:var(--app-space-4) 0 0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

/* v48：驳回原因补标签并提升到正文档（与 MyDemandsView 的驳回口径一致） */
.row-reject {
  color: var(--td-error-color);
}
</style>
