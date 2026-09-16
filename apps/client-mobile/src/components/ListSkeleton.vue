<script setup lang="ts">
import { Skeleton } from 'tdesign-mobile-vue'

/* v39 列表骨架屏：首次加载替代整页 Spinner（shared/ 需零组件库依赖，故放在 components 根目录）。 */
withDefaults(defineProps<{ rows?: number; theme?: 'text' | 'paragraph' | 'avatar' | 'image' }>(), {
  rows: 3,
  theme: 'paragraph',
})
</script>

<template>
  <div class="list-skeleton" aria-busy="true" aria-label="加载中">
    <div v-for="i in rows" :key="i" class="m-card skeleton-card">
      <Skeleton theme="text" :row-col="[{ width: '40%' }, { width: '100%' }, { width: '70%' }]" animation="gradient" />
    </div>
  </div>
</template>

<style scoped>
.list-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton-card {
  padding: 14px;
}
</style>
