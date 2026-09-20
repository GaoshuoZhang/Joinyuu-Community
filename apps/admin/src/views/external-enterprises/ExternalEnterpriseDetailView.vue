<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryTab } from '@/utils/navigation'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon, EditIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import ExternalEnterpriseFormDialog from '@/components/ExternalEnterpriseFormDialog.vue'
import {
  deleteExternalEnterprise,
  disableExternalEnterprise,
  enableExternalEnterprise,
  fetchExternalEnterprise,
  fetchExternalEnterpriseStats,
  type ExternalEnterpriseStats,
} from '@/api/external-enterprises'
import type { ExternalEnterprise, ExternalEnterpriseMember } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const enterprise = ref<ExternalEnterprise | null>(null)
const tab = useQueryTab('info', ['info', 'stats', 'members'] as const)
const acting = ref('')

/* 数据概览 */
const stats = ref<ExternalEnterpriseStats | null>(null)

/* 编辑弹窗 */
const editVisible = ref(false)

const memberColumns = [
  { colKey: 'name', title: '成员', cell: 'member' , ellipsis: true},
  { colKey: 'title', title: '职位' , ellipsis: true},
  { colKey: 'phone', title: '联系电话', width: 140 , ellipsis: true},
  { colKey: 'status', title: '账号状态', cell: 'status', width: 110 , ellipsis: true},
]

async function load() {
  const id = route.params.id as string
  enterprise.value = await fetchExternalEnterprise(id)
  stats.value = await fetchExternalEnterpriseStats(id)
}

onMounted(async () => {
  try {
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '合作企业加载失败')
  } finally {
    loading.value = false
  }
})

/* 数据概览卡片 → 跳转对应列表并自动筛选（有数据时可点击）
 * 以合作企业 ID（XE*）传参，列表按 ID 解析档案名后过滤，避免企业名歧义 */


/* 编辑 / 停用 / 归档 */
function openEdit() {
  editVisible.value = true
}

async function onDisable() {
  if (!enterprise.value) return
  acting.value = 'disable'
  try {
    await disableExternalEnterprise(enterprise.value.id)
    MessagePlugin.success('合作企业已停用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onDelete() {
  if (!enterprise.value) return
  acting.value = 'delete'
  try {
    await deleteExternalEnterprise(enterprise.value.id)
    MessagePlugin.success('合作企业已归档')
    router.back()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '归档失败')
  } finally {
    acting.value = ''
  }
}

async function onEnable() {
  if (!enterprise.value) return
  acting.value = 'enable'
  try {
    await enableExternalEnterprise(enterprise.value.id)
    MessagePlugin.success('合作企业已启用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
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

    <t-empty v-else-if="!enterprise" description="合作企业不存在" />

    <template v-else>
      <!-- 企业头部 -->
      <div class="page-card head-card">
        <div class="head-main">
          <t-avatar size="48px" class="head-avatar">{{ enterprise.name.slice(0, 1) }}</t-avatar>
          <div class="head-info">
            <div class="head-title">
              <span class="head-name">{{ enterprise.name }}</span>
              <StatusTag entity="enterprise" :value="enterprise.status" />
              <t-tag variant="light">{{ enterprise.industry }}</t-tag>
            </div>
            <div class="head-id">企业ID: <t-tag class="id-tag" size="small" variant="light">{{ enterprise.id }}</t-tag></div>
          </div>
        </div>
        <div class="head-actions">
          <t-button variant="outline" v-permission="'perm:external-enterprise:update'" @click="openEdit">
            <template #icon><EditIcon /></template>
            编辑
          </t-button>
          <t-popconfirm
            v-if="enterprise.status === 'disabled'"
            content="确认启用该合作企业？启用后恢复为正常状态"
            @confirm="onEnable"
          >
            <t-button
              variant="outline"
              theme="success"
              v-permission="'perm:external-enterprise:enable'"
              :loading="acting === 'enable'"
            >
              启用
            </t-button>
          </t-popconfirm>
          <t-popconfirm
            v-else
            content="确认停用该合作企业？"
            @confirm="onDisable"
          >
            <t-button
              variant="outline"
              v-permission="'perm:external-enterprise:disable'"
              :loading="acting === 'disable'"
            >
              停用
            </t-button>
          </t-popconfirm>
          <t-popconfirm
            v-if="enterprise.status === 'disabled'"
            content="确认归档该合作企业？归档后可在归档管理中恢复"
            @confirm="onDelete"
          >
            <t-button
              variant="outline"
              theme="danger"
              v-permission="'perm:external-enterprise:delete'"
              :loading="acting === 'delete'"
            >
              归档
            </t-button>
          </t-popconfirm>
        </div>
      </div>

      <div class="page-card">
        <t-tabs v-model="tab">
          <!-- 企业信息 -->
          <t-tab-panel value="info" label="企业信息">
            <div class="tab-body">
              <t-descriptions :column="2" bordered>
                <t-descriptions-item label="行业">{{ enterprise.industry }}</t-descriptions-item>
                <t-descriptions-item label="规模">{{ enterprise.size || '—' }}</t-descriptions-item>
                <t-descriptions-item label="成立时间">{{ enterprise.foundedAt || '—' }}</t-descriptions-item>
                <t-descriptions-item label="登记日期">{{ enterprise.registeredAt }}</t-descriptions-item>
                <t-descriptions-item label="关联成员数">{{ enterprise.members.length }} 人</t-descriptions-item>
              </t-descriptions>

              <div class="desc-block">
                <h4 class="block-title">企业简介</h4>
                <p class="desc-text">{{ enterprise.description || '—' }}</p>
              </div>
            </div>
          </t-tab-panel>

          <!-- 数据概览 -->
          <t-tab-panel value="stats" label="数据概览">
            <div class="tab-body">
              <div class="stats-grid">
                <t-link theme="default" hover="color" :href="router.resolve({ path: '/demands', query: { enterprise: enterprise.id } }).href" :disabled="(stats?.demandCount ?? 0) === 0"
                  class="stat-item"
                  :class="{ clickable: (stats?.demandCount ?? 0) > 0 }"
                >
                  <span class="stat-num">{{ stats?.demandCount ?? 0 }}</span>
                  <span class="stat-label">需求发布</span>
                </t-link>
                <t-link theme="default" hover="color" :href="router.resolve({ path: '/projects', query: { enterprise: enterprise.id } }).href" :disabled="(stats?.projectCount ?? 0) === 0"
                  class="stat-item"
                  :class="{ clickable: (stats?.projectCount ?? 0) > 0 }"
                >
                  <span class="stat-num">{{ stats?.projectCount ?? 0 }}</span>
                  <span class="stat-label">参与项目</span>
                </t-link>
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
                @row-click="({ row }: { row: ExternalEnterpriseMember }) => router.push('/users/' + row.userId)"
              >
                <template #member="{ row }">
                  <div class="member-cell">
                    <span class="member-name">{{ row.name }}</span>
                    <t-tag class="id-tag-block" size="small" variant="light">{{ row.userId }}</t-tag>
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

    <!-- 编辑合作企业（含成员增删） -->
    <ExternalEnterpriseFormDialog
      v-model:visible="editVisible"
      mode="edit"
      :enterprise="enterprise"
      @success="load"
    />
  </div>
</template>

<style scoped>
.back-btn {
  margin-bottom: 12px;
}

.head-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.head-avatar {
  flex-shrink: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-page);
}

.head-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
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

.head-id {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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
