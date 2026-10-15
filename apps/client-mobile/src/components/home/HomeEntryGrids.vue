<script setup lang="ts">
import { Grid, GridItem, Icon } from 'tdesign-mobile-vue'
import type { THEME_ENTRY_KEYS } from '@/utils/customerTheme'

export interface HomeEntry {
  themeKey?: typeof THEME_ENTRY_KEYS[number]
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

// Stable semantic keys keep colors attached to a service when permissions hide or reorder entries.
function entryStyle(entry: HomeEntry) {
  if (!entry.themeKey) return {}
  return Object.fromEntries(['background', 'icon', 'iconBackground', 'text', 'secondaryText', 'border'].map((role) => [
    `--entry-${role}`, `var(--app-entry-${entry.themeKey}-${role})`,
  ]))
}

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
      :style="entryStyle(f)"
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
      :style="entryStyle(q)"
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
/* 卡片：白底 + 1px 边框（与页面其它卡片同一视觉语言），高度统一为 1 单位。
 * justify-content 居中：库内 .t-grid-item 为 flex 纵向布局且未设主轴对齐，
 * 固定高度下内容会贴顶（方形卡尤其明显）；卡片内容整体垂直居中。 */
.feature-item,
.quick-item {
  --td-grid-item-bg-color: var(--entry-background, var(--td-bg-color-container));
  --td-grid-item-image-bg-color: transparent;

  min-height: var(--app-entry-unit);
  justify-content: center;
  border-radius: var(--td-radius-large);
  border: 1px solid var(--entry-border, var(--td-component-border));
  overflow: hidden;
}

/* 宽 2 单位卡：官方横向布局默认左右内距为 0（16px 0），卡片有边框需补内距；
 * 图标槽默认 48px（--td-grid-item-image-width），而气泡只有 36px —— 收窄到 36px，
 * 把省下的 12px 让给文案（375px 下文字区 82px → 94px，六字副标题才能单行不折行）。 */
.feature-item {
  --td-grid-item-horizontal-padding: var(--app-space-6);
  --td-grid-item-image-width: 36px;
}

.feature-item :deep(.t-grid-item__content) { min-width: 0; }
.feature-item :deep(.t-grid-item__text) { min-width: 0; }

/* 1 单位方形卡：宽高都按下限「1 单位」约束（不用 aspect-ratio 硬锁方形——
 * 窄屏上四字标签 + 图标略超方形高度时，硬比例会把文字裁掉；同排各项由网格行统一等高）。
 * 图标槽按 column=4 命中 --middle 档（基础档 --td-grid-item-image-width 不生效），
 * 收到 28px 与气泡同宽；左右内距归零、文案上边距与上下内距收紧，
 * 让「图标 + 四字标签」在 320px 宽设备上也能完整落在卡片内。 */
.quick-item {
  --td-grid-item-image-middle-width: 28px;
  --td-grid-item-text-padding-top: var(--app-space-1);
  --td-grid-item-vertical-padding: var(--app-space-3) 0;
}

/* 品牌色图标气泡：两种卡片共用 */
.entry-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--td-radius-circle);
  color: var(--entry-icon, var(--td-brand-color));
  background: var(--entry-iconBackground, var(--td-brand-color-light));
}

.entry-icon--sm {
  width: 28px;
  height: 28px;
}

.feature-label {
  display: block;
  font: var(--app-type-card-title);
  color: var(--entry-text, var(--td-text-color-primary));
}

.feature-desc {
  display: block;
  font: var(--app-type-body-sm);
  color: var(--entry-secondaryText, var(--td-text-color-secondary));
  white-space: normal;
}

.quick-label {
  display: block;
  /* 单行四字标签：收紧行高（默认 1.5），让方形卡内的图标 + 文案纵向排布不超卡片下限高度 */
  font: var(--app-type-card-title);
  color: var(--entry-text, var(--td-text-color-primary));
}
</style>
