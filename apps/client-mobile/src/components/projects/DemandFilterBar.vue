<script setup lang="ts">
import { Button, CheckTag, Search } from 'tdesign-mobile-vue'

/* 项目列表筛选条：搜索 + 分类 chips + 字典失败重试。 */
defineProps<{
  keyword: string
  placeholder?: string
  categories: { code: string; label: string }[]
  category: string
  dictError?: string
}>()

defineEmits<{
  'update:keyword': [string]
  selectCategory: [string]
  retryDict: []
}>()
</script>

<template>
  <div class="filter-bar">
    <Search
      :model-value="keyword"
      :placeholder="placeholder"
      @update:model-value="(value: string | number) => $emit('update:keyword', String(value))"
    />

    <div class="chips">
      <CheckTag variant="light" size="medium" :checked="category === ''" @change="$emit('selectCategory', '')">
        全部
      </CheckTag>
      <CheckTag
        v-for="c in categories"
        :key="c.code"
        variant="light"
        size="medium"
        :checked="category === c.label"
        @change="$emit('selectCategory', c.label)"
      >
        {{ c.label }}
      </CheckTag>
    </div>
    <p v-if="dictError" class="dict-error">
      筛选项加载失败
      <Button size="small" variant="text" theme="danger" @click="$emit('retryDict')">重试</Button>
    </p>
  </div>
</template>

<style scoped>
/* v45：搜索 + 分类收敛到同一张卡片内，两行筛选读作一组而不是两块独立浮动元素 */
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding: var(--app-space-7);
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}

.chips {
  display: flex;
  gap: var(--app-space-4);
  overflow-x: auto;
  padding-bottom: var(--app-space-1);
}

.dict-error {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.dict-error :deep(.t-button) {
  margin-left: var(--app-space-3);
}
</style>
