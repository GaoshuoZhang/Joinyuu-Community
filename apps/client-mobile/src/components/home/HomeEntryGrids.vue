<script setup lang="ts">
import { Grid, GridItem, Icon } from 'tdesign-mobile-vue'

export interface HomeEntry {
  path: string
  icon: string
  label: string
  desc?: string
}

/* 首页核心功能入口：屏幕宽按 4 单位计。
 * features：宽 2 单位 × 高 1 单位（两列，图标左 / 文案右）；
 * quick：宽 1 单位 × 高 1 单位（四列方形，图标上 / 文案下）。 */
defineProps<{ features: HomeEntry[]; quick: HomeEntry[] }>()
defineEmits<{ open: [path: string] }>()
</script>

<template>
  <!-- v48：Grid 的 gutter 会同时以内联样式写入根元素 padding 与 grid-gap，内联 padding 会让宫格
       相对其它卡片左右各内缩一个 gutter；用组件 style 覆盖该 padding（Vue 会把传入 style 与根元素
       内联 style 合并，传入者生效），不再用 !important 强覆盖库样式。gutter 取 8 落回 4px 网格。
       两种卡片高度都由 --app-entry-unit（1 单位）约束，保证同行等大。 -->
  <Grid :column="2" :gutter="8" :style="{ padding: 0 }" hover class="feature-grid stagger">
    <GridItem
      v-for="f in features"
      :key="f.path"
      class="feature-item"
      layout="horizontal"
      v-pressable
      @click="$emit('open', f.path)"
    >
      <template #image>
        <span class="entry-icon"><Icon aria-hidden="true" :name="f.icon" size="22px" /></span>
      </template>
      <template #text><span class="feature-label">{{ f.label }}</span></template>
      <template v-if="f.desc" #description><span class="feature-desc">{{ f.desc }}</span></template>
    </GridItem>
  </Grid>

  <Grid :column="4" :gutter="8" :style="{ padding: 0 }" hover class="quick-grid stagger">
    <GridItem
      v-for="q in quick"
      :key="q.path"
      class="quick-item"
      v-pressable
      @click="$emit('open', q.path)"
    >
      <template #image>
        <span class="entry-icon entry-icon--sm"><Icon aria-hidden="true" :name="q.icon" size="20px" /></span>
      </template>
      <template #text><span class="quick-label">{{ q.label }}</span></template>
    </GridItem>
  </Grid>
</template>

<style scoped>
/* 卡片：白底 + 1px 边框（与页面其它卡片同一视觉语言），高度统一为 1 单位 */
.feature-item,
.quick-item {
  --td-grid-item-bg-color: var(--td-bg-color-container);
  --td-grid-item-image-bg-color: transparent;

  min-height: var(--app-entry-unit);
  border-radius: var(--td-radius-large);
  border: 1px solid var(--td-component-border);
  overflow: hidden;
}

/* 宽 2 单位卡：官方横向布局默认左右内距为 0（16px 0），卡片有边框需补内距 */
.feature-item {
  --td-grid-item-horizontal-padding: var(--app-space-6);
}

/* 1 单位方形卡：宽高都等于 1 个单位——用 aspect-ratio 与网格列宽严格一致成方；
 * align-self 避免被网格行高拉伸而失效。官方图片槽默认 48px 会把卡片顶高，收到 32px 并收紧内距。 */
.quick-item {
  aspect-ratio: 1;
  align-self: center;
  --td-grid-item-image-width: 32px;
  --td-grid-item-vertical-padding: var(--app-space-6) var(--app-space-3);
}

/* 品牌色图标气泡：两种卡片共用 */
.entry-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--td-radius-circle);
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.entry-icon--sm {
  width: 28px;
  height: 28px;
}

.feature-label {
  display: block;
  font-size: var(--app-font-subtitle);
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.feature-desc {
  display: block;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.quick-label {
  display: block;
  font-size: var(--app-font-body);
  color: var(--td-text-color-primary);
}
</style>