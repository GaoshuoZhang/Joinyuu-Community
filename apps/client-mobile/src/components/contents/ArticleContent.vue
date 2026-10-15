<script setup lang="ts">
import { computed, ref } from 'vue'
import DOMPurify from 'dompurify'
import { Button, Image, ImageViewer } from 'tdesign-mobile-vue'
import { onImageError } from '@/utils/imageFallback'

/* 文章正文：富文本 HTML（已净化）或纯文本/Markdown 图片行块渲染。 */
const props = defineProps<{ content: string }>()

const isRichContent = computed(() => /<\/?[a-z][^>]*>/i.test(props.content))
/* 禁用内联 style：后端内容里的内联前景/背景色会绕过主题 token 写死浅色，暗色模式下正文不可读；
 * class 保留（代码块的 language-* 等既有用法依赖它），图片仍受 .rich-content img 的 max-width:100% 约束。 */
const richContent = computed(() => {
  const clean = DOMPurify.sanitize(props.content, { FORBID_ATTR: ['style'] })
  const document = new DOMParser().parseFromString(clean, 'text/html')
  document.querySelectorAll('img').forEach((image) => {
    if (image.closest('a')) return
    image.tabIndex = 0
    image.setAttribute('role', 'button')
    image.setAttribute('aria-label', `查看图片：${image.alt || '文章配图'}`)
  })
  return document.body.innerHTML
})
const viewerVisible = ref(false)
const viewerIndex = ref(0)
const viewerImages = ref<string[]>([])
function preview(images: string[], index: number) {
  viewerImages.value = images
  viewerIndex.value = index
  viewerVisible.value = true
}
function previewRichImage(event: MouseEvent | KeyboardEvent) {
  if (!(event.target instanceof HTMLImageElement) || event.target.closest('a')) return
  if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return
  event.preventDefault()
  const images = [...(event.currentTarget as HTMLElement).querySelectorAll('img')]
  preview(images.map((image) => image.src), images.indexOf(event.target))
}
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
    <ImageViewer v-model:visible="viewerVisible" v-model:index="viewerIndex" :images="viewerImages" :show-index="true" @close="viewerVisible = false" />
    <div v-if="isRichContent" class="rich-content" @click="previewRichImage" @keydown="previewRichImage" v-html="richContent"></div>
    <template v-else>
      <template v-for="(block, i) in contentBlocks" :key="i">
        <Button v-if="block.type === 'image'" class="image-preview" variant="text" aria-label="查看文章配图" @click="preview([block.url], 0)"><Image class="content-image content-img" :src="block.url" alt="文章配图" fit="contain" lazy @error="onImageError" /></Button>
        <p v-else class="para">{{ block.text }}</p>
      </template>
    </template>
  </article>
</template>

<style scoped>
.image-preview { display: block; width: 100%; height: auto; padding: 0; }
.image-preview :deep(.t-button__content) { display: block; width: 100%; }
.rich-content :deep(img[role="button"]) { cursor: zoom-in; }
.rich-content :deep(img:focus-visible) { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
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
  /* v48：与 RichTextBlock（活动/需求等富文本正文）统一行高，避免同一「正文」场景两套口径 */
  font: var(--app-type-body-relaxed);
  color: var(--td-text-color-primary);
}

.para:last-child {
  margin-bottom:0;
}

.rich-content {
  overflow-wrap: anywhere;
  font: var(--app-type-body-relaxed);
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
}

.rich-content :deep(h1) { font: var(--app-type-page-title); }
.rich-content :deep(h2) { font: var(--app-type-page-title); }
.rich-content :deep(h3),
.rich-content :deep(h4) { font: var(--app-type-section); }
.rich-content :deep(ul),
.rich-content :deep(ol) { padding-left:var(--app-space-11); }
.rich-content :deep(blockquote) { padding-left:var(--app-space-6); border-left: 3px solid var(--td-component-border); color: var(--td-text-color-secondary); }
.rich-content :deep(a) { color: var(--td-brand-color); text-decoration: underline; }
.rich-content :deep(img),
.rich-content :deep(video) { display: block; width: auto; max-width: 100%; height: auto; margin:0 auto var(--app-space-6); border-radius: var(--td-radius-large); }
/* v52：表格/代码块横向滚动到边缘不发生 scroll chaining（界面审查 LOW：自造滚动容器统一口径） */
.rich-content :deep(table) { display: block; max-width: 100%; overflow-x: auto; overscroll-behavior: contain; border-collapse: collapse; }
.rich-content :deep(th),
.rich-content :deep(td) { padding:var(--app-space-3) var(--app-space-4); border: 1px solid var(--td-component-border); }
.rich-content :deep(pre) { max-width: 100%; overflow-x: auto; overscroll-behavior: contain; padding:var(--app-space-6); background: var(--td-bg-color-secondarycontainer); }
.rich-content :deep(:last-child) { margin-bottom:0; }
</style>
