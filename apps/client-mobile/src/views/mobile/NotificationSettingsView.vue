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

/* v46：Switch 官方高度 28px 低于 44px 触控基线，改为整行可点（Cell 行高含上下 16px 内边距），
 * Switch 只承担视觉呈现；点 Switch 自身时 saving 已在 onToggle 内同步置位，行点击不会再触发一次。 */
function onRowClick(item: NoticePreferenceType) {
  if (!item.mutable || saving.value) return
  void onToggle(item, item.muted)
}
</script>

<template>
  <div class="notice-settings page-fade-in">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="load" />
    <template v-else>
      <p class="tip">关闭后该类站内信将不再写入消息中心；账号与安全通知始终送达。</p>
      <CellGroup theme="card">
        <!-- v46：整行可点切换（行级命中区 ≥44px）；不可关闭项给出行内原因说明且不响应点击 -->
        <Cell
          v-for="item in types"
          :key="item.type"
          :title="item.label"
          :description="item.mutable ? '' : '账号与安全通知不可关闭'"
          :hover="item.mutable && !saving"
          @click="onRowClick(item)"
        >
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
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.notice-settings :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}
</style>
