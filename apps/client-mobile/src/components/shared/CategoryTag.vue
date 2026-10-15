<script setup lang="ts">
import { computed } from 'vue'
import { Tag } from 'tdesign-mobile-vue'
import { categoryColorStyle } from '@/utils/categoryColor'

/* 分类标签：按类别文案稳定散列到主题入口卡的六色家族（配色算法见 utils/categoryColor，
 * 与筛选 chip 共用，保证同类别在筛选栏与列表里颜色一致）。
 * 无主题或该入口未配置配色时回退品牌色（与公版标签一致）。
 * 仅用于内容分类（需求分类/活动类型/资讯栏目/商城类别等）；
 * 生命周期状态请用 StateTag，发布者身份请用 IdentityTag。 */
const props = defineProps<{ label: string }>()
const style = computed(() => categoryColorStyle(props.label))
</script>

<template>
  <Tag class="category-tag" size="small" variant="light" theme="primary" :style="style">{{ label }}</Tag>
</template>
