<script setup lang="ts">
import { computed } from 'vue'
import DOMPurify from 'dompurify'

/* 富文本安全渲染：后端富编辑器字段（公告/活动介绍/需求描述/商品说明/政策正文等）
 * 需渲染 HTML 而非文本；统一 DOMPurify 净化后输出。 */
const props = defineProps<{ html?: string }>()
/* 禁用内联 style：后端内容里的内联前景/背景色会绕过主题 token 写死浅色，暗色模式下正文不可读；
 * class 保留（代码块的 language-* 等既有用法依赖它），图片宽度仍由 .rich-text img 的 max-width:100% 约束。 */
const safe = computed(() => DOMPurify.sanitize(props.html ?? '', { FORBID_ATTR: ['style'] }))
</script>

<template>
  <div v-if="html" class="rich-text" v-html="safe"></div>
</template>

<style scoped>
.rich-text {
  font-size: var(--app-font-body);
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
}

.rich-text :deep(p) {
  margin: 0 0 var(--app-space-4);
}

.rich-text :deep(p:last-child),
.rich-text :deep(div:last-child) {
  margin-bottom: 0;
}

/* 正文标题口径与 ArticleContent（文章正文）对齐：h1/h2 用 title、h3/h4 用 subtitle，
 * 原先 h1~h4 一律 14px 会让标题与正文无从区分。间距沿用卡片内紧凑版式，不做重构级统一。 */
.rich-text :deep(h1),
.rich-text :deep(h2),
.rich-text :deep(h3),
.rich-text :deep(h4) {
  margin: 0 0 var(--app-space-4);
  line-height: 1.45;
  color: var(--td-text-color-primary);
}

.rich-text :deep(h1),
.rich-text :deep(h2) {
  font-size: var(--app-font-title);
}

.rich-text :deep(h3),
.rich-text :deep(h4) {
  font-size: var(--app-font-subtitle);
}

.rich-text :deep(ul),
.rich-text :deep(ol) {
  margin: 0 0 var(--app-space-4);
  padding-left: var(--app-space-11);
}

.rich-text :deep(blockquote) {
  margin: 0 0 var(--app-space-4);
  padding-left: var(--app-space-6);
  border-left: 3px solid var(--td-component-border);
  color: var(--td-text-color-placeholder);
}

.rich-text :deep(a) {
  color: var(--td-brand-color);
}

.rich-text :deep(strong),
.rich-text :deep(b) {
  color: var(--td-text-color-primary);
}

.rich-text :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto var(--app-space-4);
  border-radius: var(--td-radius-default);
}
</style>
