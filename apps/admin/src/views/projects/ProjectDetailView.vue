<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import { fetchProject } from '@/api/projects'
import type { Milestone, Project, ProjectUndertaker } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const project = ref<Project | null>(null)
const tab = ref('info')

const milestoneTagMap: Record<Milestone['status'], { label: string; theme: 'success' | 'primary' | 'default' }> = {
  done: { label: '已完成', theme: 'success' },
  active: { label: '进行中', theme: 'primary' },
  todo: { label: '未开始', theme: 'default' },
}

const undertakerTypeMap: Record<ProjectUndertaker['type'], string> = {
  enterprise: '社区企业',
  individual: '社区个人',
}

async function load() {
  loading.value = true
  try {
    project.value = await fetchProject(route.params.id as string)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '项目加载失败')
  } finally {
    loading.value = false
  }
}

/* current：有 active 节点取其索引，否则取 done 数量（下一待办节点） */
const milestoneCurrent = computed(() => {
  const ms = project.value?.milestones ?? []
  const activeIndex = ms.findIndex((m) => m.status === 'active')
  if (activeIndex >= 0) return activeIndex
  return ms.filter((m) => m.status === 'done').length
})

function goSourceDemand() {
  if (project.value?.sourceDemandId) router.push(`/demands/${project.value.sourceDemandId}`)
}

onMounted(load)
</script>

<template>
  <div class="project-detail page-fade-in">
    <div class="back-row">
      <t-button variant="text" @click="router.back()">
        <template #icon><ArrowLeftIcon /></template>
        返回
      </t-button>
    </div>

    <t-skeleton
      v-if="loading"
      :row-col="[{ width: '100%', height: '200px' }, { width: '100%', height: '380px' }]"
      animation="gradient"
    />

    <template v-else-if="project">
      <!-- 项目头部 -->
      <div class="page-card head-card">
        <div class="head-main">
          <h3 class="head-title">{{ project.name }}</h3>
          <span class="head-code">{{ project.code }}</span>
          <StatusTag entity="project" :value="project.status" />
        </div>
        <t-descriptions :column="3" bordered>
          <t-descriptions-item label="立项日期">{{ project.initiatedAt }}</t-descriptions-item>
          <t-descriptions-item label="开始日期">{{ project.startDate }}</t-descriptions-item>
          <t-descriptions-item label="结束日期">{{ project.endDate }}</t-descriptions-item>
          <t-descriptions-item label="成员数">{{ project.memberCount }} 人</t-descriptions-item>
          <t-descriptions-item label="当前进度">
            <t-progress :percentage="project.progress" />
          </t-descriptions-item>
          <t-descriptions-item label="来源需求">
            <t-link v-if="project.sourceDemandId" theme="primary" hover="color" @click="goSourceDemand">
              {{ project.sourceDemandId }} · 查看
            </t-link>
            <span v-else class="muted">社区自建</span>
          </t-descriptions-item>
        </t-descriptions>
      </div>

      <div class="page-card">
        <t-tabs v-model="tab">
          <!-- 项目信息 -->
          <t-tab-panel value="info" label="项目信息">
            <div class="tab-body">
              <div class="block">
                <h4 class="block-title">承接方与占比</h4>
                <div class="undertaker-list">
                  <div v-for="u in project.undertakers" :key="u.id + u.type" class="undertaker-row">
                    <div class="ut-info">
                      <span class="ut-name">{{ u.name }}</span>
                      <t-tag variant="outline" size="small">{{ undertakerTypeMap[u.type] }}</t-tag>
                    </div>
                    <div class="ut-share">
                      <t-progress :percentage="u.share" class="ut-bar" />
                      <span class="ut-num">{{ u.share }}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="block">
                <h4 class="block-title">项目说明</h4>
                <p class="desc">{{ project.description }}</p>
              </div>
            </div>
          </t-tab-panel>

          <!-- 进度节点 -->
          <t-tab-panel value="milestones" label="进度节点">
            <div class="tab-body">
              <t-steps :current="milestoneCurrent">
                <t-step-item
                  v-for="m in project.milestones"
                  :key="m.name"
                  :title="m.name"
                  :content="m.date"
                />
              </t-steps>
              <div class="milestone-list">
                <div v-for="m in project.milestones" :key="m.name" class="milestone-item">
                  <div class="ms-main">
                    <span class="ms-name">{{ m.name }}</span>
                    <t-tag variant="light" :theme="milestoneTagMap[m.status].theme">
                      {{ milestoneTagMap[m.status].label }}
                    </t-tag>
                  </div>
                  <div class="ms-side">
                    <div v-if="m.owners?.length" class="ms-owners">
                      <t-tag v-for="owner in m.owners" :key="owner" variant="light" size="small">
                        {{ owner }}
                      </t-tag>
                    </div>
                    <span v-else class="ms-none">负责方待定</span>
                    <span class="ms-date">{{ m.date }}</span>
                  </div>
                </div>
              </div>
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </template>

    <t-empty v-else description="项目不存在或已被删除" />
  </div>
</template>

<style scoped>
.back-row {
  margin-bottom: 12px;
  margin-left: -8px;
}

.head-card {
  margin-bottom: 16px;
}

.head-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.head-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.head-code {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.muted {
  color: var(--td-text-color-secondary);
}

.tab-body {
  padding-top: 16px;
}

.block {
  margin-bottom: 24px;
}

.block-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.undertaker-list {
  display: grid;
  gap: 8px;
}

.undertaker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 10px 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.ut-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ut-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ut-share {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  max-width: 420px;
}

.ut-bar {
  flex: 1;
}

.ut-num {
  width: 44px;
  text-align: right;
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--td-text-color-primary);
}

.milestone-list {
  display: grid;
  gap: 8px;
  margin-top: 24px;
}

.milestone-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.ms-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ms-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.ms-side {
  display: flex;
  align-items: center;
  gap: 16px;
}

.ms-owners {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ms-none {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.ms-date {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
