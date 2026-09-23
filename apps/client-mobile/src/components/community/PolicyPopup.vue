<script setup lang="ts">
import { Button, Popup, Tag } from 'tdesign-mobile-vue'
import type { CommunityPolicy } from '@/types'
import RichTextBlock from '@/components/shared/RichTextBlock.vue'
import { formatLocalDate, formatLocalDateTime } from '@/utils/format'
import { safeHttpUrl } from '@/utils/validators'

/* 社区政策正文弹层：标题/摘要/正文/版本信息/附件/更新时间。 */
defineProps<{ visible: boolean; policy: CommunityPolicy | null }>()
defineEmits<{ 'update:visible': [boolean] }>()
</script>

<template>
  <Popup
    :visible="visible"
    placement="bottom"
    class="policy-pop"
    :aria-label="policy ? `政策详情：${policy.title}` : '政策详情'"
    @update:visible="(value: boolean) => $emit('update:visible', value)"
  >
    <div v-if="policy" class="pop-body">
      <Tag size="small" variant="light" theme="primary">{{ policy.category }}</Tag>
      <h3 class="p-title">{{ policy.title }}</h3>
      <p class="p-summary">{{ policy.summary }}</p>
      <RichTextBlock class="p-content" :html="policy.content" />
      <div v-if="policy.version || policy.effectiveAt || policy.publisher" class="p-meta">
        <span v-if="policy.version">版本：{{ policy.version }}</span>
        <span v-if="policy.effectiveAt">生效日期：{{ formatLocalDate(policy.effectiveAt) }}</span>
        <span v-if="policy.publisher">发布主体：{{ policy.publisher }}</span>
      </div>
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

.pop-body .p-title {
  margin:0;
  font-size: var(--app-font-title);
  line-height: 1.5;
  color: var(--td-text-color-primary);
}

.pop-body .p-summary {
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.pop-body .p-content {
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.9;
  color: var(--td-text-color-primary);
  white-space: pre-wrap;
}

.pop-body .p-updated {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.pop-body .p-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-5);
  margin: var(--app-space-5) 0 var(--app-space-1);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.pop-body .p-files {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  margin-top: var(--app-space-4);
  font-size: var(--app-font-caption);
}

.pop-body .p-files a {
  /* 附件行为可点链接：抬升到 44px 触控基线（与 DemandInfoCard 的 tel 链接同口径） */
  display: flex;
  align-items: center;
  min-height: 44px;
  color: var(--td-brand-color);
}
</style>
