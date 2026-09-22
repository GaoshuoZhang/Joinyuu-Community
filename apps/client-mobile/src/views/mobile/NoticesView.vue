<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Badge, Button, Cell, List, Toast } from 'tdesign-mobile-vue'
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
  article: '资讯与投稿',
  demand: '需求',
  project: '项目',
  mall: '积分商城',
  service: '社区服务',
}

const router = useRouter()
const notices = useNoticesStore()

const { loading, error, run } = useAsyncList(() => notices.refreshAll())

const hasMore = computed(() => notices.list.length < notices.total)
const footerState = computed(() => {
  if (!notices.list.length || error.value) return ''
  if (notices.loadingMore) return 'loading'
  return hasMore.value ? 'load-more' : ''
})

onMounted(run)

/* v46：刷新失败不再把已有列表替换为整页错误块——无数据时才整页提示，有数据时用 Toast 提示。 */
watch(error, (message) => {
  if (message && notices.list.length) Toast('刷新失败，请稍后重试')
})

const readingAll = ref(false)

async function onItemClick(n: UserNotice) {
  if (!n.read) {
    try {
      /* read() 仅在接口成功后把 item.read 置 true；失败不阻塞浏览（弱网/离线仍可阅读内容） */
      await notices.read(n.id)
    } catch {
      /* 已读标记失败忽略，允许继续打开 */
    }
  }
  if (n.link?.startsWith('/api/app/me/data-exports/')) {
    /* 下载失败给出反馈，避免点击后无响应 */
    try {
      await downloadPersonalData(n.link)
    } catch (e) {
      Toast(e instanceof ApiError ? e.message : '下载失败，请稍后重试')
    }
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

async function loadMore() {
  try {
    await notices.loadMore()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '加载更多失败，请稍后重试')
  }
}

function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
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
    <EmptyBlock v-else-if="error && !notices.list.length" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="notices.list.length === 0" text="暂无站内信" />
    <List v-else class="list stagger" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
      <p class="list-count">共 {{ formatZhNumber(notices.total) }} 条</p>
      <!-- v46：列表项按约定用 Cell 承载（此前用 Button，读屏会把整条站内信播报成按钮）；
           整行可点进入详情，Cell 自带 16px 上下内边距满足 44px 触控。 -->
      <Cell
        v-for="n in notices.list"
        :key="n.id"
        class="notice-item m-card"
        :class="{ unread: !n.read }"
        :bordered="false"
        hover
        @click="onItemClick(n)"
      >
        <template #title>
          <Badge :dot="!n.read" class="n-badge">
            <span class="n-title">{{ n.title }}</span>
          </Badge>
        </template>
        <template #description>
          <span class="n-content">{{ n.content }}</span>
          <span class="n-at">{{ TYPE_LABELS[n.type] ?? '通知' }} · {{ formatLocalDateTime(n.at) }}</span>
        </template>
      </Cell>
    </List>

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

/* v46：Cell 承载列表项——卡片外观沿用 .m-card，内边距与 Cell 官方 16px 一致 */
.notice-item {
  color: inherit;
  text-align: left;
}

.n-badge {
  flex: 1;
  min-width: 0;
}

.n-title {
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
