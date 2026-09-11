<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon, EditIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import LeaseFormDialog from '@/components/LeaseFormDialog.vue'
import { archiveLease, deriveLeaseStatus, fetchLease, fetchWorkstations, terminateLease } from '@/api/workstations'
import type { Lease, Workstation } from '@/types'

/* 租赁详情页：只读展示租约全量信息 + 办公位 + 终止时间，
 * 供租赁管理列表「详情」与办公位/办公室卡片「查看租赁」共用。
 * 头部操作与租赁管理列表 op 同步（active：编辑/终止；terminated：归档）。 */
const route = useRoute()
const router = useRouter()
const loading = ref(true)
const lease = ref<Lease | null>(null)
/* 编辑弹窗所需办公位数据（LeaseFormDialog 的 workstations prop） */
const workstations = ref<Workstation[]>([])
const acting = ref('')
const formVisible = ref(false)
/* 已归档条目：隐藏写操作（编辑/终止/归档），打印保留 */
const isArchived = computed(() => !!lease.value?.deletedAt)

const rentPeriodMap: Record<string, string> = { day: '日', week: '周', month: '月', year: '年' }
const renterTypeMap: Record<string, string> = { enterprise: '企业', individual: '用户', custom: '自定义' }

const termText = computed(() => {
  const l = lease.value
  if (!l) return '—'
  return l.longTerm ? `${l.startDate} ~ 长期` : `${l.startDate} ~ ${l.endDate}`
})

const viewStatus = computed(() => (lease.value ? deriveLeaseStatus(lease.value) : 'active'))

function goBack() {
  router.push('/workstations/leases')
}

/* 租赁方跳转：企业 → 社区企业详情；个人 → 用户详情（自定义不跳） */
function goRenter() {
  const l = lease.value
  if (!l) return
  if ((l.renterType ?? 'custom') === 'enterprise') router.push(`/enterprises/${l.enterpriseId}`)
  else if ((l.renterType ?? 'custom') === 'individual') router.push(`/users/${l.enterpriseId}`)
}

function openPrint() {
  if (!lease.value) return
  window.open(router.resolve({ path: `/prints/lease/${lease.value.id}` }).href, '_blank', 'noopener')
}

/* 编辑租约（复用列表页弹窗：仅调整租期/租金/联系人，换办公位需终止后重建） */
function openEdit() {
  if (!lease.value) return
  formVisible.value = true
}

/* 终止租约并释放全部关联办公位（同步列表页操作，需二次确认） */
async function onTerminate() {
  if (!lease.value) return
  acting.value = 'terminate'
  try {
    await terminateLease(lease.value.id)
    MessagePlugin.success('租约已终止，关联办公位已释放')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 归档已终止租约（同步列表页操作，可在归档管理中恢复） */
async function onArchive() {
  if (!lease.value) return
  acting.value = 'archive'
  try {
    await archiveLease(lease.value.id)
    MessagePlugin.success('租约已归档')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function load() {
  loading.value = true
  try {
    lease.value = await fetchLease(String(route.params.id))
  } catch {
    lease.value = null
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    workstations.value = await fetchWorkstations()
  } catch {
    /* 办公位选项加载失败：编辑弹窗办公位树为空，不影响详情展示 */
  }
})
</script>

<template>
  <div class="lease-detail">
    <PageHeader :title="`租赁详情 · ${lease?.id ?? ''}`" description="租约基础信息、办公位归属与联系人">
      <template #actions>
        <t-tag v-if="isArchived" theme="default" variant="light">已归档</t-tag>
        <t-button variant="outline" @click="goBack">
          <template #icon><ArrowLeftIcon /></template>
          返回列表
        </t-button>
        <t-button v-if="lease" @click="openPrint">打印租约</t-button>
        <template v-if="lease && !isArchived">
          <t-button v-if="lease.status === 'active'" variant="outline" @click="openEdit">
            <template #icon><EditIcon /></template>
            编辑
          </t-button>
          <t-popconfirm
            v-if="lease.status === 'active'"
            content="确认终止该租约？关联办公位将立即释放"
            @confirm="onTerminate"
          >
            <t-button variant="outline" theme="danger" :loading="acting === 'terminate'">终止</t-button>
          </t-popconfirm>
          <t-popconfirm
            v-if="lease.status === 'terminated'"
            content="确认归档该租约？归档后可在归档管理中恢复"
            @confirm="onArchive"
          >
            <t-button variant="outline" theme="warning" :loading="acting === 'archive'">归档</t-button>
          </t-popconfirm>
        </template>
      </template>
    </PageHeader>

    <div class="page-card">
      <t-loading :loading="loading">
        <t-empty v-if="!loading && !lease" description="租约不存在或已删除" />
        <template v-else-if="lease">
        <div class="head-row">
          <StatusTag entity="lease" :value="viewStatus" />
          <span v-if="viewStatus === 'terminated' && lease.terminatedAt" class="terminated-at">
            终止于 {{ lease.terminatedAt.slice(0, 10) }}
          </span>
        </div>

        <t-descriptions :column="2" bordered size="medium" class="detail-desc">
          <t-descriptions-item label="租约编号">{{ lease.id }}</t-descriptions-item>
          <t-descriptions-item label="租赁方">
            <t-link
              v-if="(lease.renterType ?? 'custom') !== 'custom'"
              theme="primary"
              hover="color"
              @click="goRenter"
            >
              {{ lease.enterpriseName }}<t-tag v-if="lease.enterpriseId" class="id-tag" size="small" variant="light">{{ lease.enterpriseId }}</t-tag>
            </t-link>
            <span v-else>{{ lease.enterpriseName }}<t-tag v-if="lease.enterpriseId" class="id-tag" size="small" variant="light">{{ lease.enterpriseId }}</t-tag></span>
          </t-descriptions-item>
          <t-descriptions-item label="租赁方类型">
            {{ renterTypeMap[lease.renterType ?? 'custom'] }}
          </t-descriptions-item>
          <t-descriptions-item label="租期">{{ termText }}</t-descriptions-item>
          <t-descriptions-item label="租金">
            {{ lease.monthlyRent }} 元 / {{ rentPeriodMap[lease.rentPeriod ?? 'month'] }}
          </t-descriptions-item>
          <t-descriptions-item label="联系人">
            {{ lease.contactName }}（{{ lease.contactPhone }}）
          </t-descriptions-item>
          <t-descriptions-item label="办公位" :span="2">
            <t-tag v-for="label in lease.workstationLabels" :key="label" variant="light" class="ws-tag">
              {{ label }}
            </t-tag>
            <span v-if="!lease.workstationLabels.length" class="muted">—</span>
          </t-descriptions-item>
          <t-descriptions-item v-if="viewStatus === 'terminated'" label="终止时间" :span="2">
            {{ lease.terminatedAt ?? '—' }}
          </t-descriptions-item>
        </t-descriptions>
      </template>
      </t-loading>
    </div>

    <LeaseFormDialog
      v-model:visible="formVisible"
      mode="edit"
      :lease="lease"
      :workstations="workstations"
      @success="load"
    />
  </div>
</template>

<style scoped>
.head-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.terminated-at {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.detail-desc {
  max-width: 860px;
}

.ws-tag {
  margin: 2px 4px 2px 0;
}

.muted {
  color: var(--td-text-color-placeholder);
}
</style>
