<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Loading, Progress, Tag } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchMyProjects } from '@/api/projects'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { MyProject } from '@/types'

/* 移动我的项目（只读）：role 标签（本人承接=蓝/企业承接=灰+企业名）+ 进度条 + 里程碑清单 */
const { data, loading, error, run } = useAsyncList<MyProject[]>(fetchMyProjects)

const projects = computed(() => data.value ?? [])
const empty = computed(() => !loading.value && !error.value && projects.value.length === 0)

onMounted(run)
</script>

<template>
  <div class="page-fade-in m-my-projects">
    <h2 class="page-title">我的项目</h2>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <EmptyBlock v-else-if="empty" text="暂无承接中的项目" />
    <div v-else class="stagger list">
      <section v-for="p in projects" :key="p.id" class="m-card">
        <header class="row">
          <h3 class="name">{{ p.name }}</h3>
          <Tag v-if="p.role === '本人承接'" theme="primary" variant="light" size="small">本人承接</Tag>
          <template v-else>
            <Tag theme="default" variant="light" size="small">企业承接</Tag>
            <span v-if="p.enterpriseName" class="ent">{{ p.enterpriseName }}</span>
          </template>
        </header>

        <Progress class="progress" :percentage="p.progress" />

        <ul v-if="p.milestones.length" class="milestones">
          <li v-for="m in p.milestones" :key="m.id" class="milestone" :class="{ done: m.done }">
            <span class="mark">{{ m.done ? '✅' : '○' }}</span>
            <span class="m-title">{{ m.title }}</span>
          </li>
        </ul>
        <p v-else class="milestones-empty">暂无里程碑</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.m-my-projects {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-title {
  margin: 0;
  padding: 0 2px;
  font-size: 18px;
}

.state {
  padding: 20px 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.name {
  flex: 1;
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  min-width: 0;
}

.ent {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.progress {
  margin-top: 10px;
}

.milestones {
  margin: 12px 0 0;
  padding: 10px 0 0 0;
  border-top: 1px dashed var(--td-component-border);
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.milestone {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.milestone.done {
  color: var(--td-text-color-primary);
}

.milestone .mark {
  flex-shrink: 0;
}

.milestones-empty {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px dashed var(--td-component-border);
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
