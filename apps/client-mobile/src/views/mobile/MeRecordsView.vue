<script setup lang="ts">
import { computed } from 'vue'
import { Cell, CellGroup } from 'tdesign-mobile-vue'
import { useConfigStore } from '@/stores/config'

/* 我的记录（二级收纳页）：按业务流程归类项目、参与记录、场地服务与内容足迹。 */
const config = useConfigStore()

/* 按用户任务频率排序；与首页快捷入口同一口径，空间预约关闭时隐藏整个场地服务分组。 */
const groups = computed<{ title: string; entries: { path: string; label: string }[] }[]>(() => {
  const list: { title: string; entries: { path: string; label: string }[] }[] = [
    {
      title: '项目与需求',
      entries: [
        { path: '/me/projects', label: '我的项目' },
        { path: '/me/demands', label: '我的需求' },
        { path: '/me/responses', label: '我的响应' },
      ],
    },
    {
      title: '申请与参与',
      entries: [
        { path: '/me/applications', label: '我的申请' },
        { path: '/me/enrollments', label: '我的报名' },
      ],
    },
    {
      title: '场地服务',
      entries: [
        ...(config.config.reservationOpen
          ? [
              { path: '/me/reservations', label: '我的预约' },
              { path: '/me/leases', label: '我的租约' },
            ]
          : []),
      ],
    },
    {
      title: '内容与足迹',
      entries: [
        { path: '/me/articles', label: '我的投稿' },
        { path: '/me/favorites', label: '我的收藏' },
        { path: '/me/history', label: '浏览历史' },
      ],
    },
  ]
  /* 开关关闭后整组入口可能为空，此时连标题一并隐藏，避免出现空分组标题 */
  return list.filter((group) => group.entries.length > 0)
})
</script>

<template>
  <div class="page-fade-in me-records">
    <template v-for="g in groups" :key="g.title">
      <h2 class="group-title">{{ g.title }}</h2>
      <CellGroup theme="card">
        <router-link v-for="e in g.entries" :key="e.path" class="cell-link" :to="e.path" :aria-label="e.label">
          <Cell :title="e.label" arrow />
        </router-link>
      </CellGroup>
    </template>
  </div>
</template>

<style scoped>
.me-records {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

/* 卡片宽度与页面容器对齐：CellGroup 自带外边距与页面 padding 叠加导致偏窄，置零并补边框 */
.me-records :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}

.group-title {
  margin: 0 var(--app-space-1);
  font: var(--app-type-emphasis-sm);
  color: var(--td-text-color-secondary);
}

.cell-link { display: block; color: inherit; text-decoration: none; }
.cell-link:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; }
</style>
