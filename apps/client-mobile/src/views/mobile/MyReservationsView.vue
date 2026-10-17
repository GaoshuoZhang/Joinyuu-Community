<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Icon, List, Toast } from 'tdesign-mobile-vue'
import { confirmDialog } from '@/utils/confirmDialog'
import { useAsyncList } from '@/composables/useAsyncList'
import { cancelReservation, fetchMyReservations } from '@/api/spaces'
import StateTag from '@/components/shared/StateTag.vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { SpaceReservation } from '@/types'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { formatLocalDate, formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 移动我的预约：预约卡片；pending/approved 可取消（Dialog 二次确认）+ Toast + 列表刷新。
 * 已过结束时间的 approved 由服务端派生为 ended（已完成），因此不会出现在可取消分支里。 */
const { data, loading, error, run } = useAsyncList(fetchMyReservations)
const router = useRouter()
const reservations = computed(() => data.value ?? [])
const { visibleItems, hasMore, showMore } = useIncrementalList(reservations)
const footerState = computed(() => (hasMore.value ? 'load-more' : ''))
function loadMore() {
  if (!hasMore.value) return
  showMore()
}
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}
onMounted(run)

const actingId = ref('')

function canCancel(r: SpaceReservation) {
  return r.status === 'pending' || r.status === 'approved'
}

function onCancelTap(r: SpaceReservation) {
  confirmDialog({
    title: '取消预约',
    content: `确认取消「${r.spaceName}」${formatLocalDate(r.date)} ${r.start}-${r.end} 的预约？`,
    cancelBtn: '保留预约',
    confirmBtn: '确认取消',
    onConfirm: () => {
      void doCancel(r)
    },
  })
}

async function doCancel(r: SpaceReservation) {
  actingId.value = r.id
  try {
    await cancelReservation(r.id)
    Toast('已取消预约')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '取消失败，请稍后重试')
  } finally {
    actingId.value = ''
  }
}
</script>

<template>
  <div class="page-fade-in my-reservations">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!reservations.length" text="暂无预约记录，选择合适的场地和时段开始预约" action-text="预约空间" @action="router.push('/spaces')" />
    <List v-else class="stagger list" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
      <p class="list-count">共 {{ formatZhNumber(reservations.length) }} 条</p>
      <article
        v-for="r in visibleItems"
        :key="r.id"
        class="m-card record-card"
      >
        <!-- v51：卡片主体用 router-link 承载跳转（真链接：支持 Ctrl/中键在新标签打开）；
             操作按钮留在链接之外，避免嵌套可交互元素 -->
        <router-link class="reserve-main" :to="`/me/reservations/${r.id}`">
          <div class="row">
            <h2 class="name">{{ r.spaceName }}</h2>
            <StateTag kind="reservation" :value="r.status" />
          </div>
          <p v-if="r.identityType" class="subject">
            <IdentityTag :type="r.identityType" />
            <span class="subject-name">{{ r.subjectName }}</span>
          </p>
          <p class="meta"><Icon aria-hidden="true" name="calendar" size="14px" />{{ formatLocalDate(r.date) }} · {{ r.start }} - {{ r.end }}</p>
          <p class="submitted-at">提交于 {{ formatLocalDateTime(r.createdAt) }}</p>
          <p v-if="r.rejectReason" class="reject-reason">驳回原因：{{ r.rejectReason }}</p>
        </router-link>
        <div v-if="canCancel(r)" class="ops">
          <Button theme="danger" variant="outline" size="small" :disabled="actingId === r.id" @click.stop="onCancelTap(r)">
            {{ actingId === r.id ? '处理中…' : '取消预约' }}
          </Button>
        </div>
      </article>
    </List>
  </div>
</template>

<style scoped>
.my-reservations {
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

/* 卡片主体是真链接（router-link），焦点环由全局 :focus-visible 提供 */
.reserve-main { display: block; }

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-5);
}

.name {
  margin:0;
  font: var(--app-type-card-title);
  min-width: 0;
}

.meta {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.submitted-at {
  margin: var(--app-space-4) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.reject-reason {
  margin:var(--app-space-4) 0 0;
  color: var(--td-error-color);
  font: var(--app-type-caption);
}

.subject {
  display: flex;
  align-items: center;
  gap:var(--app-space-3);
  margin:var(--app-space-4) 0 0;
  font: var(--app-type-caption);
}

.subject-name {
  color: var(--td-text-color-secondary);
}

.ops {
  margin-top:var(--app-space-5);
  display: flex;
  justify-content: flex-end;
}
</style>
