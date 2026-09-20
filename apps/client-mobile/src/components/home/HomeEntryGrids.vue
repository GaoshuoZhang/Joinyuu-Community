<script setup lang="ts">
import { Grid, GridItem, Icon } from 'tdesign-mobile-vue'

export interface HomeEntry {
  path: string
  icon: string
  label: string
  desc?: string
}

/* 首页入口宫格：双入口品牌渐变卡 + 四宫格常用入口。 */
defineProps<{ features: HomeEntry[]; quick: HomeEntry[] }>()
defineEmits<{ open: [path: string] }>()
</script>

<template>
  <Grid :column="2" :gutter="10" hover class="feature-grid stagger">
    <GridItem
      v-for="f in features"
      :key="f.path"
      class="feature-item"
      v-pressable
      @click="$emit('open', f.path)"
    >
      <template #image><Icon aria-hidden="true" :name="f.icon" size="22px" /></template>
      <template #text><span class="feature-label">{{ f.label }}</span></template>
      <template #description><span class="feature-desc">{{ f.desc }}</span></template>
    </GridItem>
  </Grid>

  <Grid :column="4" :gutter="8" hover class="quick-grid stagger">
    <GridItem v-for="q in quick" :key="q.path" class="quick-item" v-pressable @click="$emit('open', q.path)">
      <template #image><span class="quick-icon"><Icon aria-hidden="true" :name="q.icon" size="22px" /></span></template>
      <template #text>{{ q.label }}</template>
    </GridItem>
  </Grid>
</template>

<style scoped>
/* 双入口卡：浅品牌底 + 品牌色图标（弱化满幅品牌色块，保持宫格与卡片边缘对齐） */
.feature-grid {
  padding:0 !important;
  --td-grid-item-bg-color: transparent;
}

.feature-item {
  --td-grid-item-bg-color: transparent;
  --td-grid-item-image-bg-color: transparent;

  border-radius: var(--td-radius-large);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
  text-align: left;
  padding: var(--app-space-7) var(--app-space-6);
}

.feature-item :deep(.t-grid-item__content) {
  align-items: flex-start;
}

.feature-label {
  font-size: var(--app-font-subtitle);
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.feature-desc {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

/* 四宫格：白底卡片项 + 品牌浅底图标气泡；同样清掉根 padding 对齐卡片边缘 */
.quick-grid {
  padding:0 !important;
  --td-grid-item-bg-color: var(--td-bg-color-container);
}

.quick-item {
  --td-grid-item-image-bg-color: transparent;

  border-radius: var(--td-radius-large);
  border: 1px solid var(--td-component-border);
  overflow: hidden;
}

.quick-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--td-radius-circle);
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}
</style>
