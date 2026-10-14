<script setup lang="ts">
import RowMoreActions from '@/components/RowMoreActions.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useRouter } from 'vue-router'
import { AddIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import SpaceFormDialog from '@/components/SpaceFormDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import { fetchSpaces, setSpaceStatus } from '@/api/spaces'
import { spaceTypeMap } from '@/constants/status'
import type { Space } from '@/types'

/* 空间管理面板：新增/编辑基础信息 + 维护登记/停用/恢复（预约审核见「公共空间预约」）；
 * 点击空间条目 → 跳转空间详情页（信息 + 预约日历 + 预约明细） */
const router = useRouter()
const loading = ref(false)
const loadError = ref('')
const list = ref<Space[]>([])
const acting = ref('')

const columns = [
  { colKey: 'name', title: '空间', cell: 'name', width: 160, resizable: true , ellipsis: true},
  { colKey: 'type', title: '类型', cell: 'type', width: 100, resizable: true , ellipsis: true},
  { colKey: 'capacity', title: '容量', cell: 'capacity', width: 80, resizable: true , ellipsis: true},
  { colKey: 'location', title: '位置', width: 130, resizable: true , ellipsis: true},
  { colKey: 'booking', title: '预约方式', cell: 'booking', width: 150, resizable: true , ellipsis: true},
  { colKey: 'fee', title: '费用', cell: 'fee', width: 120, resizable: true , ellipsis: true},
  { colKey: 'time', title: '开放时段', cell: 'time', width: 140, resizable: true , ellipsis: true},
  { colKey: 'equipment', title: '设备', cell: 'equipment', width: 200, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 180 },
]

/* 列配置：本地持久化显隐/顺序 */
const visibleColKeys = ref<string[]>(columns.map((c) => c.colKey))

const visibleColumns = computed(() => {
  const byKey = new Map(columns.map((c) => [c.colKey, c]))
  return visibleColKeys.value.map((k) => byKey.get(k)).filter(Boolean)
})

async function load() {
  loading.value = true
  try {
    list.value = await fetchSpaces()
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
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

/* 新增 / 编辑空间 */
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

/* 预约方式文案：与空间详情页「预约方式」同一文本口径（含免审核分支），避免两处口径漂移 */
function bookingText(row: Space): string {
  if (!row.needReservation) return '免预约'
  return row.needApproval ? '需预约 · 需审核' : '需预约 · 免审核'
}

onMounted(load)
</script>

<template>
  <div class="space-list-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="公共空间管理" description="公共空间的新增、时段与设备维护（预约审核见「公共空间预约」）">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="spaces"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增空间
        </t-button>
      </template>
    </PageHeader>

    <!-- 页面提示：非筛选控件，独立成行，避免占用筛选条 -->
    <p class="panel-tip">空间名被社区活动引用，重命名会要求同步活动数据。</p>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="visibleColumns"
        :loading="loading"
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @row-click="({ row }: { row: Space }) => goDetail(row)"
      >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <t-tag class="id-tag-block" size="small" variant="light">{{ row.id }}</t-tag>
        </template>
        <template #type="{ row }">
          <t-tag variant="light">{{ spaceTypeMap[row.type] ?? row.type }}</t-tag>
        </template>
        <template #booking="{ row }">
          <t-tag variant="outline" size="small">{{ bookingText(row) }}</t-tag>
        </template>
        <template #fee="{ row }">
          <!-- 费用：积分/小时，0 = 免费（与客户端空间列表同一展示口径） -->
          <t-tag v-if="row.feePerHour > 0" variant="light" theme="warning" size="small">
            {{ row.feePerHour }} 积分/小时
          </t-tag>
          <t-tag v-else variant="light" theme="success" size="small">免费</t-tag>
        </template>
        <template #capacity="{ row }">
          {{ row.capacity ?? '—' }}
        </template>
        <template #time="{ row }">
          {{ row.allDay ? '全天开放' : row.openTime && row.closeTime ? `${row.openTime} ~ ${row.closeTime}` : '—' }}
        </template>
        <template #equipment="{ row }">
          <t-tag v-for="eq in row.equipment" :key="eq" variant="light" class="eq-tag">{{ eq }}</t-tag>
        </template>
        <template #status="{ row }">
          <StatusTag entity="space" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
            <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
            <RowMoreActions>

            <template v-if="row.status === 'available'">
              <t-popconfirm
                content="确认登记维护？维护期间不可预约"
                confirm-btn="登记维护"
                @confirm="onSetStatus(row, 'maintenance')"
              >
                <t-button variant="text" size="small" theme="warning" :loading="acting === `${row.id}:maintenance`">
                  维护
                </t-button>
              </t-popconfirm>
              <t-popconfirm
                :content="`确认停用空间「${row.name}」？停用后不再开放预约`"
                :confirm-btn="{ content: '停用', theme: 'danger' }"
                @confirm="onSetStatus(row, 'disabled')"
              >
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
            </RowMoreActions>
          </div>
        </template>

        <template #empty>
          <ListEmptyState description="暂无空间">
            <template #action>
              <t-button @click="openCreate">新增空间</t-button>
            </template>
          </ListEmptyState>
        </template>
      </t-table>
    </div>

    <SpaceFormDialog v-model:visible="formVisible" :mode="formMode" :space="currentSpace" @success="load" />
  </div>
</template>

<style scoped>
.panel-tip {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.eq-tag {
  margin: 2px 4px 2px 0;
}
</style>
