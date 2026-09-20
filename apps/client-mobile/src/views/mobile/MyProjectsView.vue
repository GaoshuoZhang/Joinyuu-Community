<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Icon, Progress, Tag } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { fetchMyProjects } from '@/api/projects'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { Milestone, MyProject } from '@/types'
import { formatZhNumber } from '@/utils/format'

/* 移动我的项目：角色标签 + 进度 + 里程碑状态；点击进入项目详情（双方共享记录）。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList<MyProject[]>(fetchMyProjects)

const projects = computed(() => data.value ?? [])
const { visibleItems, hasMore, showMore } = useIncrementalList(projects)
const empty = computed(() => !loading.value && !error.value && projects.value.length === 0)

function milestoneState(m: Milestone): { icon: string; accepted: boolean } {
  const status = m.status ?? (m.done ? 'accepted' : 'todo')
  if (status === 'accepted') return { icon: 'check-circle-filled', accepted: true }
  if (status === 'submitted') return { icon: 'time', accepted: false }
  return { icon: 'circle', accepted: false }
}

onMounted(run)
</script>

<template>
  <div class="page-fade-in m-my-projects">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="empty" text="暂无承接中的项目" />
    <div v-else class="stagger list">
      <p class="list-count">共 {{ formatZhNumber(projects.length) }} 个</p>
      <section v-for="p in visibleItems" :key="p.id" class="m-card project-card" v-pressable @click="router.push(`/me/projects/${p.id}`)">
        <header class="row">
          <h2 class="name">{{ p.name }}</h2>
          <Tag v-if="p.finishedAt" theme="success" variant="light" size="small">已结项</Tag>
          <Tag v-if="p.role === '需求发起方'" theme="success" variant="light" size="small">需求发起方</Tag>
          <Tag v-else-if="p.role === '本人承接'" theme="primary" variant="light" size="small">本人承接</Tag>
          <template v-else>
            <Tag theme="default" variant="light" size="small">企业承接</Tag>
            <span v-if="p.enterpriseName" class="ent">{{ p.enterpriseName }}</span>
          </template>
        </header>

        <p v-if="p.partnerName" class="partner">协作方：{{ p.partnerName }}</p>

        <Progress class="progress" :percentage="p.progress" />

        <ul v-if="p.milestones.length" class="milestones">
          <li v-for="m in p.milestones" :key="m.id" class="milestone" :class="{ done: m.done }">
            <Icon aria-hidden="true"
              :name="milestoneState(m).icon"
              size="16px"
              class="mark"
              :class="{ accepted: milestoneState(m).accepted }"
            />
            <span class="m-title">{{ m.title }}</span>
          </li>
        </ul>
        <p v-else class="milestones-empty">暂无里程碑</p>
      </section>
      <Button v-if="hasMore" block variant="outline" @click="showMore">
        加载更多（剩余 {{ formatZhNumber(projects.length - visibleItems.length) }} 个）
      </Button>
    </div>
  </div>
</template>

<style scoped>
.m-my-projects {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}


.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.project-card {
  cursor: pointer;
}

.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.name {
  flex: 1;
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.4;
  min-width: 0;
}

.ent {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.partner {
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.progress {
  margin-top:var(--app-space-5);
}

.milestones {
  margin:var(--app-space-6) 0 0;
  padding:var(--app-space-5) 0 0 0;
  border-top: 1px dashed var(--td-component-border);
  list-style: none;
  display: flex;
  flex-direction: column;
  gap:var(--app-space-3);
}

.milestone {
  display: flex;
  align-items: center;
  gap:var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.milestone.done {
  color: var(--td-text-color-primary);
}

.milestone .mark {
  flex-shrink: 0;
}

.milestone .mark.accepted {
  color: var(--td-success-color);
}

.milestones-empty {
  margin:var(--app-space-5) 0 0;
  padding-top:var(--app-space-5);
  border-top: 1px dashed var(--td-component-border);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}
</style>
