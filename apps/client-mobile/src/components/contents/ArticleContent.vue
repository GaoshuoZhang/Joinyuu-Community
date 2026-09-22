<script setup lang="ts">
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import { Image } from 'tdesign-mobile-vue'
import { onImageError } from '@/utils/imageFallback'

/* 文章正文：富文本 HTML（已净化）或纯文本/Markdown 图片行块渲染。 */
const props = defineProps<{ content: string }>()

const isRichContent = computed(() => /<\/?[a-z][^>]*>/i.test(props.content))
/* 禁用内联 style：后端内容里的内联前景/背景色会绕过主题 token 写死浅色，暗色模式下正文不可读；
 * class 保留（代码块的 language-* 等既有用法依赖它），图片仍受 .rich-content img 的 max-width:100% 约束。 */
const richContent = computed(() => DOMPurify.sanitize(props.content, { FORBID_ATTR: ['style'] }))
const contentBlocks = computed(() =>
  props.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => {
      const image = text.match(/^!\[[^\]]*\]\((.+)\)$/)
      return image ? { type: 'image' as const, url: image[1] } : { type: 'text' as const, text }
    }),
)
</script>

<template>
  <article class="m-card body">
    <div v-if="isRichContent" class="rich-content" v-html="richContent"></div>
    <template v-else>
      <template v-for="(block, i) in contentBlocks" :key="i">
        <Image v-if="block.type === 'image'" class="content-image" :src="block.url" alt="文章配图" fit="contain" lazy @error="onImageError" />
        <p v-else class="para">{{ block.text }}</p>
      </template>
    </template>
  </article>
</template>

<style scoped>
.body {
  padding:var(--app-space-8);
}

.content-image {
  display: block;
  width: 100%;
  margin:0 0 var(--app-space-6);
  max-height: 420px;
  aspect-ratio: 4 / 3;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-large);
}

.para {
  margin:0 0 var(--app-space-6);
  font-size: var(--app-font-body);
  /* v48：与 RichTextBlock（活动/需求等富文本正文）统一行高，避免同一「正文」场景两套口径 */
  line-height: 1.8;
  color: var(--td-text-color-primary);
}

.para:last-child {
  margin-bottom:0;
}

.rich-content {
  overflow-wrap: anywhere;
  font-size: var(--app-font-body);
  line-height: 1.8;
  color: var(--td-text-color-primary);
}

.rich-content :deep(p),
.rich-content :deep(ul),
.rich-content :deep(ol),
.rich-content :deep(blockquote),
.rich-content :deep(pre) {
  margin:0 0 var(--app-space-6);
}

.rich-content :deep(h1),
.rich-content :deep(h2),
.rich-content :deep(h3),
.rich-content :deep(h4) {
  margin:var(--app-space-10) 0 var(--app-space-4);
  line-height: 1.45;
}

.rich-content :deep(h1) { font-size: var(--app-font-title); }
.rich-content :deep(h2) { font-size: var(--app-font-title); }
.rich-content :deep(h3),
.rich-content :deep(h4) { font-size: var(--app-font-subtitle); }
.rich-content :deep(ul),
.rich-content :deep(ol) { padding-left:var(--app-space-11); }
.rich-content :deep(blockquote) { padding-left:var(--app-space-6); border-left: 3px solid var(--td-component-border); color: var(--td-text-color-secondary); }
.rich-content :deep(a) { color: var(--td-brand-color); text-decoration: underline; }
.rich-content :deep(img),
.rich-content :deep(video) { display: block; width: auto; max-width: 100%; height: auto; margin:0 auto var(--app-space-6); border-radius: var(--td-radius-large); }
.rich-content :deep(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.rich-content :deep(th),
.rich-content :deep(td) { padding:var(--app-space-3) var(--app-space-4); border: 1px solid var(--td-component-border); }
.rich-content :deep(pre) { max-width: 100%; overflow-x: auto; padding:var(--app-space-6); background: var(--td-bg-color-secondarycontainer); }
.rich-content :deep(:last-child) { margin-bottom:0; }
</style>
