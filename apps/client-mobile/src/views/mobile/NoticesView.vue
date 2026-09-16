<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Popup, Switch, Tag, Toast } from 'tdesign-mobile-vue'
import { ApiError } from '@/api/http'
import { fetchNoticePrefs, updateNoticePrefs, archiveNotice } from '@/api/notices'
import { downloadPersonalData } from '@/api/me'
import { useNoticesStore } from '@/stores/notices'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { NoticeType, UserNotice } from '@/types'

const TYPE_LABELS: Record<NoticeType, string> = {
  audit_result: '审核结果',
  enroll_result: '报名结果',
  order: '订单',
  points: '积分与签到',
  system: '系统通知',
}

type NoticeFilter = 'todo' | 'all' | 'archived' | NoticeType

const FILTERS: { value: NoticeFilter; label: string }[] = [
  { value: 'todo', label: '待处理' },
  { value: 'all', label: '全部' },
  { value: 'audit_result', label: '审核结果' },
  { value: 'enroll_result', label: '报名结果' },
  { value: 'order', label: '订单' },
  { value: 'points', label: '积分与签到' },
  { value: 'system', label: '系统通知' },
  { value: 'archived', label: '已归档' },
]

const router = useRouter()
const notices = useNoticesStore()

const { loading, error, run } = useAsyncList(() => notices.refreshAll())

onMounted(run)

const typeFilter = ref<NoticeFilter>('todo')
const filtered = computed(() => {
  const list = notices.list
  if (typeFilter.value === 'todo') return list.filter((n) => !n.archived && !n.read && !!n.link)
  if (typeFilter.value === 'all') return list.filter((n) => !n.archived)
  if (typeFilter.value === 'archived') return list.filter((n) => n.archived)
  return list.filter((n) => !n.archived && n.type === typeFilter.value)
})
const readingAll = ref(false)

/* v39：归档 / 恢复 */
async function onArchive(n: UserNotice) {
  try {
    await archiveNotice(n.id, !n.archived)
    Toast(n.archived ? '已恢复' : '已归档')
    await run()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '操作失败，请稍后重试')
  }
}

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

/* v38：通知偏好（启用的类型集合；Mock 中同时用于列表过滤，真实后端用于推送开关） */
const prefsVisible = ref(false)
const enabledTypes = ref<NoticeType[]>([])
const ALL_TYPES: NoticeType[] = ['audit_result', 'enroll_result', 'order', 'points', 'system']

async function loadPrefs() {
  try {
    enabledTypes.value = await fetchNoticePrefs()
  } catch {
    enabledTypes.value = [...ALL_TYPES]
  }
}

async function togglePref(type: NoticeType, value: boolean) {
  const next = value ? [...new Set([...enabledTypes.value, type])] : enabledTypes.value.filter((item) => item !== type)
  if (!next.length) {
    Toast('至少保留一种通知类型')
    return
  }
  const prev = enabledTypes.value
  enabledTypes.value = next
  try {
    await updateNoticePrefs(next)
    await run()
  } catch (e) {
    enabledTypes.value = prev
    Toast(e instanceof ApiError ? e.message : '设置失败，请稍后重试')
  }
}

onMounted(() => {
  void loadPrefs()
})
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
        <Button theme="light" size="small" @click="prefsVisible = true">提醒设置</Button>
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

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="notices.list.length === 0" text="暂无站内信" />
    <EmptyBlock v-else-if="filtered.length === 0" :text="typeFilter === 'todo' ? '没有待处理的通知' : typeFilter === 'archived' ? '暂无归档通知' : '该筛选下暂无通知'" />
    <div v-else class="list stagger">
      <p class="list-count">共 {{ filtered.length }} 条</p>
      <div v-for="n in filtered" :key="n.id" class="notice-item m-card" v-pressable :class="{ unread: !n.read }" @click="onItemClick(n)">
        <div class="n-head">
          <span class="n-dot" :class="{ on: !n.read }" />
          <span class="n-title">{{ n.title }}</span>
          <a class="n-archive" v-pressable @click.stop="onArchive(n)">{{ n.archived ? '恢复' : '归档' }}</a>
        </div>
        <p class="n-content">{{ n.content }}</p>
        <p class="n-at">{{ TYPE_LABELS[n.type] ?? '通知' }} · {{ n.at }}</p>
      </div>
    </div>

    <Popup v-model:visible="prefsVisible" placement="bottom">
      <div class="prefs-sheet">
        <h3 class="prefs-title">提醒设置</h3>
        <p class="prefs-tip">关闭后该类通知将不再出现在站内信列表（接入真实推送后同样生效）。</p>
        <div v-for="type in ALL_TYPES" :key="type" class="prefs-row">
          <span>{{ TYPE_LABELS[type] }}</span>
          <Switch
            :value="enabledTypes.includes(type)"
            @change="(value: unknown) => togglePref(type, Boolean(value))"
          />
        </div>
      </div>
    </Popup>
  </div>
</template>

<style scoped>
.m-notices {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prefs-sheet {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.prefs-title {
  margin: 0;
  font-size: 15px;
}

.prefs-tip {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.prefs-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  border-top: 1px solid var(--td-component-border);
}

.prefs-row:first-of-type {
  border-top: 0;
}

.n-archive {
  margin-left: auto;
  color: var(--td-brand-color);
  font-size: 12px;
  cursor: pointer;
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
  flex-wrap: wrap;
  gap: 8px;
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
