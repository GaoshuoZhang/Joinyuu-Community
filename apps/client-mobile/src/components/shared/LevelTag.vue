<script setup lang="ts">
import { computed } from 'vue'
import { Tag } from 'tdesign-mobile-vue'
import { LEVEL_COLOR_COUNT } from '@/utils/customerTheme'

/* 等级标签：Lv.N + 等级名（个体与企业等级共用同一套配色）。
 * 主题提供 levelColors（1–10 级）时用该级实色作底、文字取 --app-level-N-text（按亮度自动黑/白）；
 * 主题未提供或等级超出 1–10 时，var() 回退到品牌标签色，与既有的企业库 Lv 标签完全一致，
 * 公版与旧主题不受影响。 */
const props = defineProps<{ level: number; name?: string }>()

const text = computed(() => (props.name ? `Lv.${props.level} ${props.name}` : `Lv.${props.level}`))
const usable = computed(() => Number.isInteger(props.level) && props.level >= 1 && props.level <= LEVEL_COLOR_COUNT)
const style = computed(() => {
  const brandText = 'var(--td-tag-primary-color, var(--td-brand-color))'
  const brandBackground = 'var(--td-tag-primary-light-color, var(--td-brand-color-light))'
  if (!usable.value) return { color: brandText, backgroundColor: brandBackground, borderColor: brandBackground }
  return {
    color: `var(--app-level-${props.level}-text, ${brandText})`,
    backgroundColor: `var(--app-level-${props.level}, ${brandBackground})`,
    borderColor: `var(--app-level-${props.level}, ${brandBackground})`,
  }
})
</script>

<template>
  <Tag class="level-tag" size="small" variant="light" theme="primary" :style="style">{{ text }}</Tag>
</template>
