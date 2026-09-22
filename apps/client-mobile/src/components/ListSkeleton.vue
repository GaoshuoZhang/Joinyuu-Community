<script setup lang="ts">
import { Skeleton } from 'tdesign-mobile-vue'

/* v39 列表骨架屏：首次加载替代整页 Spinner（shared/ 需零组件库依赖，故放在 components 根目录）。
 * 全仓调用方只传 rows，原来的 theme prop 无人使用，已删除（模板固定 theme="text"）。 */
withDefaults(defineProps<{ rows?: number }>(), {
  rows: 3,
})
</script>

<template>
  <div class="list-skeleton" role="status" aria-live="polite" aria-busy="true" aria-label="加载中">
    <div v-for="i in rows" :key="i" class="m-card skeleton-card">
      <Skeleton theme="text" :row-col="[{ width: '40%' }, { width: '100%' }, { width: '70%' }]" animation="gradient" />
    </div>
  </div>
</template>

<style scoped>
.list-skeleton {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.skeleton-card {
  padding:var(--app-space-7);
}
</style>
