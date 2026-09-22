<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Button, Popup } from 'tdesign-mobile-vue'
import type { HomeAnnouncement } from '@/types'
import RichTextBlock from '@/components/shared/RichTextBlock.vue'
import { formatLocalDateTime } from '@/utils/format'

/* v40 运营公告详情弹层（单条：调用方传入被点击的那一条）。
 * v47：后台可配置「跳转链接」，有链接时提供站内跳转入口。 */
const props = defineProps<{ visible: boolean; announcement: HomeAnnouncement | null }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

const router = useRouter()

function onOpenLink() {
  const link = props.announcement?.link
  if (!link) return
  emit('update:visible', false)
  void router.push(link)
}
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
      <Button v-if="announcement.link" theme="primary" block @click="onOpenLink">查看详情</Button>
      <Button variant="outline" block @click="$emit('update:visible', false)">关闭</Button>
    </div>
  </Popup>
</template>

<style scoped>
.announce-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  /* v46：整层限高，保证底部「关闭」按钮始终可见可点（弹层自身已含安全区，见 .t-popup--bottom） */
  max-height: 80vh;
  padding: var(--app-space-8) var(--app-space-8) var(--app-space-5);
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

/* v46：公告正文可能很长——内容区独立滚动，超出视口的内容可触达
 * （TDesign 底部弹层已内置 padding-bottom: env(safe-area-inset-bottom)，页面不再叠加） */
.announce-content {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 72vh;
  overflow-y: auto;
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}
</style>
