<script setup lang="ts">
import { Search } from 'tdesign-mobile-vue'

/* 项目列表筛选条：关键词搜索（v48 按用户要求移除分类 chips，并去掉外层的白色卡片容器——
 * 与「广场 > 活动」的搜索框保持同一形态：页面灰底上一个 44px 的白色搜索框）。 */
defineProps<{
  keyword: string
  placeholder?: string
}>()

defineEmits<{
  'update:keyword': [string]
}>()
</script>

<template>
  <Search
    :model-value="keyword"
    :placeholder="placeholder"
    @update:model-value="(value: string | number) => $emit('update:keyword', String(value))"
  />
</template>