<script setup lang="ts">
import { watch } from 'vue'
import { Button, Popup, Tag } from 'tdesign-mobile-vue'
import type { CommunityPolicy } from '@/types'
import RichTextBlock from '@/components/shared/RichTextBlock.vue'
import { formatLocalDate, formatLocalDateTime } from '@/utils/format'
import { safeHttpUrl } from '@/utils/validators'

/* 社区政策正文弹层：标题/版本信息/摘要/正文/附件/更新时间。 */
const props = defineProps<{ visible: boolean; policy: CommunityPolicy | null }>()
defineEmits<{ 'update:visible': [boolean] }>()
let returnFocus: HTMLElement | null = null
watch(() => props.visible, (visible) => {
  if (visible) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
})
function focusContent() {
  document.querySelector<HTMLElement>('.policy-pop[role="dialog"] .p-title')?.focus()
}
function restoreFocus() {
  returnFocus?.focus()
  returnFocus = null
}
</script>

<template>
  <Popup
    :visible="visible"
    placement="bottom"
    class="policy-pop"
    :aria-label="policy ? `政策详情：${policy.title}` : '政策详情'"
    @opened="focusContent"
    @closed="restoreFocus"
    @update:visible="(value: boolean) => $emit('update:visible', value)"
  >
    <div v-if="policy" class="pop-body">
      <Tag class="p-category" size="small" variant="light" theme="primary">{{ policy.category }}</Tag>
      <h3 class="p-title" tabindex="-1">{{ policy.title }}</h3>
      <div v-if="policy.version || policy.effectiveAt" class="p-meta">
        <span v-if="policy.version">版本：{{ policy.version }}</span>
        <span v-if="policy.effectiveAt">生效日期：{{ formatLocalDate(policy.effectiveAt) }}</span>
      </div>
      <p class="p-summary">{{ policy.summary }}</p>
      <RichTextBlock class="p-content" :html="policy.content" />
      <div v-if="policy.attachments?.length" class="p-files">
        <a v-for="file in policy.attachments" :key="file.url" :href="safeHttpUrl(file.url)" target="_blank" rel="noopener">{{ file.name }}</a>
      </div>
      <p class="p-updated">更新时间：{{ policy.updatedAt.length === 10 ? formatLocalDate(policy.updatedAt) : formatLocalDateTime(policy.updatedAt) }}</p>
      <Button variant="outline" block @click="$emit('update:visible', false)">关闭</Button>
    </div>
  </Popup>
</template>

<style scoped>
.policy-pop {
  display: flex;
}

.pop-body {
  box-sizing: border-box;
  width: 100%;
  max-height: 70vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--app-space-9) var(--app-space-8) calc(var(--app-space-10) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-large) var(--td-radius-large) 0 0;
}

.pop-body .p-category {
  align-self: flex-start;
  max-width: 100%;
  height: auto;
  white-space: normal;
  overflow-wrap: anywhere;
}

.pop-body .p-title {
  margin:0;
  font: var(--app-type-page-title);
  color: var(--td-text-color-primary);
}

.pop-body .p-summary {
  margin:0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.pop-body .p-content {
  margin:0;
  font: var(--app-type-body-relaxed);
  color: var(--td-text-color-primary);
  white-space: pre-wrap;
}

.pop-body .p-updated {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.pop-body .p-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-5);
  margin: 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.pop-body .p-files {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  margin-top: var(--app-space-4);
  font: var(--app-type-body-sm);
}

.pop-body .p-files a {
  /* 附件行为可点链接：抬升到 44px 触控基线（与 DemandInfoCard 的 tel 链接同口径） */
  display: flex;
  align-items: center;
  min-height: 44px;
  color: var(--td-brand-color);
}
</style>
