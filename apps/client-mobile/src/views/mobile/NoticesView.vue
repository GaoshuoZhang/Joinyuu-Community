<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Badge, Button, Toast } from 'tdesign-mobile-vue'
import { ApiError } from '@/api/http'
import { downloadPersonalData } from '@/api/me'
import { useNoticesStore } from '@/stores/notices'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { NoticeType, UserNotice } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

const TYPE_LABELS: Record<NoticeType, string> = {
  audit_result: '审核结果',
  enroll_result: '报名结果',
  order: '订单',
  points: '积分与签到',
  system: '系统通知',
  invite: '企业邀请',
  transfer: '负责人转移',
  report: '举报处理',
  article: '资讯与投稿',
  demand: '需求',
  project: '项目',
  mall: '积分商城',
  service: '社区服务',
}

const router = useRouter()
const notices = useNoticesStore()

const { loading, error, run } = useAsyncList(() => notices.refreshAll())

onMounted(run)

const readingAll = ref(false)

async function onItemClick(n: UserNotice) {
  try {
    if (!n.read) await notices.read(n.id)
  } catch {
    return
  }
  if (n.link?.startsWith('/api/app/me/data-exports/')) {
    await downloadPersonalData(n.link)
    return
  }
  if (n.link) await router.push(n.link)
}

async function onReadAll() {
  readingAll.value = true
  try {
    await notices.readAll()
    Toast('已全部标记为已读')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '操作失败，请稍后重试')
  } finally {
    readingAll.value = false
  }
}

async function onLoadMore() {
  try {
    await notices.loadMore()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '加载更多失败，请稍后重试')
  }
}

</script>

<template>
  <div class="m-notices page-fade-in">
    <div class="toolbar">
      <span class="unread-count" :class="{ zero: notices.unread === 0 }">未读 {{ formatZhNumber(notices.unread) }} 条</span>
      <Button
        theme="light"
        size="small"
        :disabled="notices.unread === 0"
        :loading="readingAll"
        @click="onReadAll"
      >
        全部已读
      </Button>
    </div>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="notices.list.length === 0" text="暂无站内信" />
    <div v-else class="list stagger">
      <p class="list-count">共 {{ formatZhNumber(notices.total) }} 条</p>
      <Button v-for="n in notices.list" :key="n.id" variant="text" block class="notice-item m-card pressable" :class="{ unread: !n.read }" @click="onItemClick(n)">
        <span class="n-head">
          <Badge :dot="!n.read" class="n-badge">
            <span class="n-title">{{ n.title }}</span>
          </Badge>
        </span>
        <span class="n-content">{{ n.content }}</span>
        <span class="n-at">{{ TYPE_LABELS[n.type] ?? '通知' }} · {{ formatLocalDateTime(n.at) }}</span>
      </Button>
      <Button v-if="notices.list.length < notices.total" block variant="outline" :loading="notices.loadingMore" @click="onLoadMore">
        加载更多（剩余 {{ formatZhNumber(notices.total - notices.list.length) }} 条）
      </Button>
    </div>

  </div>
</template>

<style scoped>
.m-notices {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.unread-count {
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
  font-weight: 600;
}

.unread-count.zero {
  color: var(--td-text-color-placeholder);
  font-weight: 400;
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.notice-item {
  display: block;
  width: 100%;
  height: auto;
  color: inherit;
  text-align: left;
  white-space: normal;
  cursor: pointer;
}

.n-head {
  display: flex;
  align-items: center;
  gap:var(--app-space-4);
}

.n-badge {
  flex: 1;
  min-width: 0;
}

.n-title {
  flex: 1;
  font-size: var(--app-font-body);
  line-height: 1.45;
}

.notice-item.unread .n-title {
  font-weight: 600;
}

.n-content {
  display: block;
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.n-at {
  display: block;
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}
</style>
