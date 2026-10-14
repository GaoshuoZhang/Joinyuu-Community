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
  font: var(--app-type-section);
}

.announce-at {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

/* v46：公告正文可能很长——内容区独立滚动，超出视口的内容可触达
 * （TDesign 底部弹层已内置 padding-bottom: env(safe-area-inset-bottom)，页面不再叠加）
 * v52：滚动到边缘不发生 scroll chaining（界面审查 LOW：自造滚动容器统一口径） */
.announce-content {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 72vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin:0;
  font: var(--app-type-body-relaxed);
  color: var(--td-text-color-secondary);
}

/* v52：vh 不含移动端浏览器工具栏动态显隐，dvh 兜底（界面审查 LOW：限高单位统一口径，
 * 渐进增强模式同 tokens.css 的 .top-tabs .t-tabs__content；不支持 dvh 时保留 vh 值） */
@supports (height: 100dvh) {
  .announce-sheet { max-height: 80dvh; }
  .announce-content { max-height: 72dvh; }
}
</style>
