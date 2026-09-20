<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Cell, CellGroup } from 'tdesign-mobile-vue'

/* 我的记录（二级收纳页）：项目/需求/响应/报名/预约/租约/投稿/申请/收藏/浏览历史。 */
const router = useRouter()

const entries: { path: string; label: string }[] = [
  { path: '/me/projects', label: '我的项目' },
  { path: '/me/demands', label: '我的需求' },
  { path: '/me/responses', label: '我的响应' },
  { path: '/me/enrollments', label: '活动报名' },
  { path: '/me/reservations', label: '空间预约' },
  { path: '/me/leases', label: '我的租约' },
  { path: '/me/articles', label: '我的投稿' },
  { path: '/me/applications', label: '申请记录' },
  { path: '/me/favorites', label: '我的收藏' },
  { path: '/me/history', label: '浏览历史' },
]
</script>

<template>
  <div class="page-fade-in me-records">
    <CellGroup theme="card">
      <Cell v-for="e in entries" :key="e.path" :title="e.label" arrow @click="router.push(e.path)" />
    </CellGroup>
  </div>
</template>

<style scoped>
.me-records {
  padding: var(--app-space-8);
}

/* 卡片宽度与页面容器对齐：CellGroup 自带外边距与页面 padding 叠加导致偏窄，置零并补边框 */
.me-records :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}
</style>
