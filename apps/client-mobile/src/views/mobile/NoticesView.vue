<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Loading, Tag, Toast } from 'tdesign-mobile-vue'
import { ApiError } from '@/api/http'
import { useNoticesStore } from '@/stores/notices'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { NoticeType, UserNotice } from '@/types'

const TYPE_LABELS: Record<NoticeType, string> = {
  audit_result: '审核结果',
  enroll_result: '报名结果',
  order: '订单',
  points: '积分与签到',
  system: '系统通知',
}

const FILTERS: { value: 'all' | NoticeType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'audit_result', label: '审核结果' },
  { value: 'enroll_result', label: '报名结果' },
  { value: 'order', label: '订单' },
  { value: 'points', label: '积分与签到' },
  { value: 'system', label: '系统通知' },
]

const router = useRouter()
const notices = useNoticesStore()

const { loading, error, run } = useAsyncList(() => notices.refreshAll())

onMounted(run)

const typeFilter = ref<'all' | NoticeType>('all')
const filtered = computed(() =>
  typeFilter.value === 'all' ? notices.list : notices.list.filter((n) => n.type === typeFilter.value),
)
const readingAll = ref(false)

async function onItemClick(n: UserNotice) {
  try {
    if (!n.read) await notices.read(n.id)
  } catch {
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
</script>

<template>
  <div class="m-notices page-fade-in">
    <div class="toolbar">
      <div class="chips">
        <Tag
          v-for="f in FILTERS"
          :key="f.value"
          :theme="typeFilter === f.value ? 'primary' : 'default'"
          variant="light"
          size="medium"
          @click="typeFilter = f.value"
        >
          {{ f.label }}
        </Tag>
      </div>
      <div class="toolbar-right">
        <span class="unread-count" :class="{ zero: notices.unread === 0 }">未读 {{ notices.unread }} 条</span>
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
    </div>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <EmptyBlock v-else-if="notices.list.length === 0" text="暂无站内信" />
    <EmptyBlock v-else-if="filtered.length === 0" text="该类型下暂无通知" />
    <div v-else class="list stagger">
      <div v-for="n in filtered" :key="n.id" class="notice-item m-card" :class="{ unread: !n.read }" @click="onItemClick(n)">
        <div class="n-head">
          <span class="n-dot" :class="{ on: !n.read }" />
          <span class="n-title">{{ n.title }}</span>
        </div>
        <p class="n-content">{{ n.content }}</p>
        <p class="n-at">{{ TYPE_LABELS[n.type] ?? '通知' }} · {{ n.at }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.m-notices {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chips {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.unread-count {
  font-size: 12px;
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
  gap: 10px;
}

.notice-item {
  cursor: pointer;
}

.n-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.n-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  flex-shrink: 0;
}

.n-dot.on {
  background: var(--td-brand-color);
}

.n-title {
  flex: 1;
  font-size: 14px;
  line-height: 1.45;
}

.notice-item.unread .n-title {
  font-weight: 600;
}

.n-content {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.n-at {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
