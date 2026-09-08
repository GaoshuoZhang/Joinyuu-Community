<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import {
  fetchExternalEnterprise,
  fetchExternalEnterpriseStats,
  type ExternalEnterpriseStats,
} from '@/api/external-enterprises'
import type { ExternalEnterprise } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const enterprise = ref<ExternalEnterprise | null>(null)
const tab = ref('info')

/* 数据概览 */
const stats = ref<ExternalEnterpriseStats | null>(null)

const memberColumns = [
  { colKey: 'name', title: '成员', cell: 'member' },
  { colKey: 'title', title: '职位' },
  { colKey: 'phone', title: '手机号', width: 140 },
  { colKey: 'status', title: '账号状态', cell: 'status', width: 110 },
]

onMounted(async () => {
  try {
    const id = route.params.id as string
    enterprise.value = await fetchExternalEnterprise(id)
    stats.value = await fetchExternalEnterpriseStats(id)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '外部企业加载失败')
  } finally {
    loading.value = false
  }
})

/* 数据概览卡片 → 跳转对应列表并自动筛选（有数据时可点击）
 * 以外部企业 ID（XE*）传参，列表按 ID 解析档案名后过滤，避免企业名歧义 */
function goDemands() {
  if (!enterprise.value || !stats.value || stats.value.demandCount === 0) return
  router.push({ path: '/demands', query: { enterprise: enterprise.value.id } })
}

function goProjects() {
  if (!enterprise.value || !stats.value || stats.value.projectCount === 0) return
  router.push({ path: '/projects', query: { enterprise: enterprise.value.id } })
}
</script>

<template>
  <div class="external-detail page-fade-in">
    <t-button variant="text" theme="default" class="back-btn" @click="router.back()">
      <template #icon><ArrowLeftIcon /></template>
      返回
    </t-button>

    <t-skeleton
      v-if="loading"
      :row-col="[{ width: '100%', height: '132px' }, { width: '100%', height: '360px' }]"
      animation="gradient"
    />

    <t-empty v-else-if="!enterprise" description="外部企业不存在" />

    <template v-else>
      <!-- 企业头部 -->
      <div class="page-card head-card">
        <div class="head-main">
          <t-avatar size="48px" class="head-avatar">{{ enterprise.name.slice(0, 1) }}</t-avatar>
          <div class="head-info">
            <div class="head-title">
              <span class="head-name">{{ enterprise.name }}</span>
              <t-tag variant="light">{{ enterprise.industry }}</t-tag>
              <t-tag variant="outline" size="small">外部企业 · 未入驻</t-tag>
            </div>
            <t-tag variant="outline" size="small">企业ID: {{ enterprise.id }}</t-tag>
          </div>
        </div>
      </div>

      <div class="page-card">
        <t-tabs v-model="tab">
          <!-- 企业信息 -->
          <t-tab-panel value="info" label="企业信息">
            <div class="tab-body">
              <t-descriptions :column="2" bordered>
                <t-descriptions-item label="行业">{{ enterprise.industry }}</t-descriptions-item>
                <t-descriptions-item label="首次合作时间">{{ enterprise.firstCooperationAt }}</t-descriptions-item>
                <t-descriptions-item label="累计合作次数">{{ enterprise.cooperationCount }} 次</t-descriptions-item>
                <t-descriptions-item label="关联成员数">{{ enterprise.members.length }} 人</t-descriptions-item>
              </t-descriptions>

              <div class="desc-block">
                <h4 class="block-title">企业简介</h4>
                <p class="desc-text">{{ enterprise.description }}</p>
              </div>
            </div>
          </t-tab-panel>

          <!-- 数据概览 -->
          <t-tab-panel value="stats" label="数据概览">
            <div class="tab-body">
              <div class="stats-grid">
                <div
                  class="stat-item"
                  :class="{ clickable: (stats?.demandCount ?? 0) > 0 }"
                  @click="goDemands"
                >
                  <span class="stat-num">{{ stats?.demandCount ?? 0 }}</span>
                  <span class="stat-label">需求发布</span>
                </div>
                <div
                  class="stat-item"
                  :class="{ clickable: (stats?.projectCount ?? 0) > 0 }"
                  @click="goProjects"
                >
                  <span class="stat-num">{{ stats?.projectCount ?? 0 }}</span>
                  <span class="stat-label">参与项目</span>
                </div>
              </div>
            </div>
          </t-tab-panel>

          <!-- 关联成员 -->
          <t-tab-panel value="members" label="关联成员">
            <div class="tab-body">
              <t-table
                row-key="userId"
                :data="enterprise.members"
                :columns="memberColumns"
                empty="暂无关联成员"
                @row-click="({ row }) => router.push('/users/' + row.userId)"
              >
                <template #member="{ row }">
                  <div class="member-cell">
                    <span class="member-name">{{ row.name }}</span>
                    <span class="member-id">{{ row.userId }}</span>
                  </div>
                </template>
                <template #status="{ row }">
                  <StatusTag entity="user" :value="row.status" />
                </template>
              </t-table>
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </template>
  </div>
</template>

<style scoped>
.back-btn {
  margin-bottom: 12px;
}

.head-card {
  margin-bottom: 16px;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.head-avatar {
  flex-shrink: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-page);
}

.head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.head-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.tab-body {
  padding-top: 16px;
}

.desc-block {
  margin-top: 24px;
}

.block-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.desc-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
}

.member-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.member-id {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  padding-top: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.stat-item.clickable {
  cursor: pointer;
  transition: border-color 120ms ease;
}

.stat-item.clickable:hover {
  border-color: var(--td-brand-color);
}

.stat-num {
  font-size: 24px;
  font-weight: 600;
  line-height: 32px;
  color: var(--td-brand-color);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
</style>
