<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Cell, CellGroup, Switch, Toast } from 'tdesign-mobile-vue'
import { fetchNoticePreferences, updateNoticePreferences } from '@/api/notices'
import type { NoticePreferenceType } from '@/types'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'

/* 通知设置：按通知类型开启/静音；账号与安全类通知（mutable=false）不可关闭。 */
const loading = ref(true)
const error = ref('')
const types = ref<NoticePreferenceType[]>([])
const saving = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetchNoticePreferences()
    types.value = res.types
  } catch (e) {
    error.value = e instanceof Error ? e.message : '通知设置加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function onToggle(item: NoticePreferenceType, enabled: boolean | number) {
  if (saving.value) return
  const nextMuted = types.value
    .map((t) => (t.type === item.type ? { ...t, muted: !enabled } : t))
    .filter((t) => t.muted)
    .map((t) => t.type)
  saving.value = true
  try {
    const res = await updateNoticePreferences(nextMuted)
    types.value = res.types
    Toast(enabled ? '已开启该类通知' : '已静音该类通知')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="notice-settings page-fade-in">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="load" />
    <template v-else>
      <p class="tip">关闭后该类站内信将不再写入消息中心；账号与安全通知始终送达。</p>
      <CellGroup theme="card">
        <Cell v-for="item in types" :key="item.type" :title="item.label">
          <template #right-icon>
            <Switch
              :value="!item.muted"
              :disabled="!item.mutable || saving"
              @change="(value: boolean | number | string) => onToggle(item, Boolean(value))"
            />
          </template>
        </Cell>
      </CellGroup>
    </template>
  </div>
</template>

<style scoped>
.notice-settings {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

.tip {
  margin: 0;
  padding: 0 var(--app-space-1);
  font-size: var(--app-font-caption);
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}

.notice-settings :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}
</style>
