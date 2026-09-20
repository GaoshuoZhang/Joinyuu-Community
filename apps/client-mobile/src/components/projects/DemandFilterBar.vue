<script setup lang="ts">
import { Button, CheckTag, Search } from 'tdesign-mobile-vue'

/* 项目列表筛选条：搜索 + 分类 chips + 排序 + 字典失败重试。 */
defineProps<{
  keyword: string
  placeholder?: string
  categories: { code: string; label: string }[]
  category: string
  sort: 'latest' | 'hot'
  dictError?: string
  sorts: { value: 'latest' | 'hot'; label: string }[]
}>()

defineEmits<{
  'update:keyword': [string]
  selectCategory: [string]
  selectSort: ['latest' | 'hot']
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

    <div class="sorts">
      <span class="sorts-label">排序</span>
      <CheckTag
        v-for="s in sorts"
        :key="s.value"
        variant="light"
        size="medium"
        :checked="sort === s.value"
        @change="$emit('selectSort', s.value)"
      >
        {{ s.label }}
      </CheckTag>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
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

.sorts {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
}

.sorts-label {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}
</style>
