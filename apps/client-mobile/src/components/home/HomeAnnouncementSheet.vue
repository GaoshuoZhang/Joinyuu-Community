<script setup lang="ts">
import { Button, Popup } from 'tdesign-mobile-vue'
import type { HomeAnnouncement } from '@/types'
import RichTextBlock from '@/components/shared/RichTextBlock.vue'
import { formatLocalDateTime } from '@/utils/format'

/* v40 运营公告详情弹层。 */
defineProps<{ visible: boolean; announcement: HomeAnnouncement | null }>()
defineEmits<{ 'update:visible': [boolean] }>()
</script>

<template>
  <Popup
    :visible="visible"
    placement="bottom"
    @update:visible="(value: boolean) => $emit('update:visible', value)"
  >
    <div v-if="announcement" class="announce-sheet">
      <h3 class="announce-title">{{ announcement.title }}</h3>
      <p class="announce-at">{{ formatLocalDateTime(announcement.at) }}</p>
      <RichTextBlock class="announce-content" :html="announcement.content" />
      <Button variant="outline" block @click="$emit('update:visible', false)">关闭</Button>
    </div>
  </Popup>
</template>

<style scoped>
.announce-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.announce-title {
  margin:0;
  font-size: var(--app-font-subtitle);
  line-height: 1.5;
}

.announce-at {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.announce-content {
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}
</style>
