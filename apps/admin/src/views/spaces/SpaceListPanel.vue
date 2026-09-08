<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useRouter } from 'vue-router'
import { AddIcon, RefreshIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import SpaceFormDialog from '@/components/SpaceFormDialog.vue'
import { fetchSpaces, setSpaceStatus } from '@/api/spaces'
import { spaceTypeMap } from '@/constants/status'
import type { Space } from '@/types'

/* 空间管理面板：新增/编辑基础信息 + 维护登记/停用/恢复（预约审批与使用看板在另两个 Tab）；
 * 点击空间条目 → 跳转空间详情页（信息 + 预约日历 + 预约明细） */
const router = useRouter()
const loading = ref(false)
const list = ref<Space[]>([])
const acting = ref('')

const columns = [
  { colKey: 'name', title: '空间', cell: 'name', minWidth: 160, resizable: true },
  { colKey: 'type', title: '类型', cell: 'type', width: 100, resizable: true },
  { colKey: 'capacity', title: '容量', width: 80, resizable: true },
  { colKey: 'location', title: '位置', width: 130, resizable: true },
  { colKey: 'time', title: '开放时段', cell: 'time', width: 120, resizable: true },
  { colKey: 'equipment', title: '设备', cell: 'equipment', minWidth: 200, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 210 },
]

async function load() {
  loading.value = true
  try {
    list.value = await fetchSpaces()
  } finally {
    loading.value = false
  }
}

async function onSetStatus(row: Space, status: Space['status']) {
  acting.value = `${row.id}:${status}`
  try {
    await setSpaceStatus(row.id, status)
    const text = status === 'available' ? '已恢复可用' : status === 'maintenance' ? '已登记维护' : '已停用'
    MessagePlugin.success(`空间「${row.name}」${text}`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 创建 / 编辑空间 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const currentSpace = ref<Space | null>(null)

function openCreate() {
  formMode.value = 'create'
  currentSpace.value = null
  formVisible.value = true
}

function openEdit(row: Space) {
  formMode.value = 'edit'
  currentSpace.value = row
  formVisible.value = true
}

/* 行点击 → 空间详情页 */
function goDetail(row: Space) {
  router.push(`/spaces/${row.id}`)
}

onMounted(load)
</script>

<template>
  <div class="space-list-panel page-fade-in">
    <PageHeader title="公共空间管理" description="公共空间的创建、时段与设备维护（预约审批与使用看板见「公共空间预约」）" />

    <div class="page-filter-bar">
      <span class="panel-tip">空间名被社区活动场地引用，重命名会要求同步活动数据（原型提示）。</span>
      <t-button variant="outline" style="margin-left: auto" @click="load">
        <template #icon><RefreshIcon /></template>
        刷新
      </t-button>
      <t-button theme="primary" @click="openCreate">
        <template #icon><AddIcon /></template>
        新增空间
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        empty="暂无空间数据"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <div class="cell-sub">{{ row.id }}</div>
        </template>
        <template #type="{ row }">
          <t-tag variant="light">{{ spaceTypeMap[row.type] ?? row.type }}</t-tag>
        </template>
        <template #time="{ row }">
          {{ row.allDay ? '全天开放' : `${row.openTime} ~ ${row.closeTime}` }}
        </template>
        <template #equipment="{ row }">
          <t-tag v-for="eq in row.equipment" :key="eq" variant="outline" class="eq-tag">{{ eq }}</t-tag>
        </template>
        <template #status="{ row }">
          <StatusTag entity="space" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
            <template v-if="row.status === 'available'">
              <t-popconfirm content="确认登记维护？维护期间不可预约" @confirm="onSetStatus(row, 'maintenance')">
                <t-button variant="text" size="small" theme="warning" :loading="acting === `${row.id}:maintenance`">
                  维护
                </t-button>
              </t-popconfirm>
              <t-popconfirm content="确认停用该空间？停用后不再开放预约" @confirm="onSetStatus(row, 'disabled')">
                <t-button variant="text" size="small" theme="danger" :loading="acting === `${row.id}:disabled`">
                  停用
                </t-button>
              </t-popconfirm>
            </template>
            <t-button
              v-else
              variant="text"
              size="small"
              theme="primary"
              :loading="acting === `${row.id}:available`"
              @click="onSetStatus(row, 'available')"
            >
              恢复可用
            </t-button>
          </div>
        </template>
      </t-table>
    </div>

    <SpaceFormDialog v-model:visible="formVisible" :mode="formMode" :space="currentSpace" @success="load" />
  </div>
</template>

<style scoped>
.panel-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cell-title {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.eq-tag {
  margin: 2px 4px 2px 0;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}


</style>
