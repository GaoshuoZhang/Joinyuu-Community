<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { SearchIcon } from 'tdesign-icons-vue-next'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import {
  discardOutboxMessage,
  fetchOutboxLogs,
  fetchOutboxMessages,
  retryOutboxMessage,
} from '@/api/messageOutbox'
import { useListQueryState } from '@/utils/listQuery'
import StatusTag from '@/components/StatusTag.vue'
import { statusMap } from '@/constants/status'
import type { OutboxDeliveryLog, OutboxMessage, OutboxStatus } from '@/types'

/* 消息中心 · 发送记录（P0 Outbox）：投递状态 / 失败原因 / 投递日志 / 手动重试与终止。
 * 重试退避与死信由后端调度任务自动处理，此处用于人工干预与排障。 */
const loading = ref(true)
const loadError = ref('')
const list = ref<OutboxMessage[]>([])
const total = ref(0)
const stats = ref<Record<string, number>>({})

const KIND_LABEL: Record<string, string> = { sms: '短信', email: '邮件', inapp: '站内信' }
/* 文案取自 constants/status.ts（状态标签与筛选选项共用同一词表），页面不再自造 */
const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(statusMap.outbox).map(([key, conf]) => [key, conf.label]),
)

const query = reactive({ page: 1, pageSize: 20, status: '' as OutboxStatus | '', channelKind: '', keyword: '' })

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  total: total.value,
  showJumper: true,
  pageSizeOptions: [20, 50, 100],
}))

/* 状态芯片：顺序固定（不随接口返回的键序变化），颜色取状态词表的语义色，
 * 点击即筛选、再次点击取消筛选 —— 取代原先与状态下拉重复的只读统计标签 */
const STATUS_KEYS: OutboxStatus[] = ['pending', 'sending', 'sent', 'failed', 'dead', 'skipped']
const statusChips = computed(() =>
  STATUS_KEYS.map((key) => ({
    key,
    label: STATUS_LABEL[key],
    theme: statusMap.outbox[key].theme,
    count: stats.value[key] ?? 0,
  })),
)

function onStatusChip(key: OutboxStatus, checked: boolean) {
  query.status = checked ? key : ''
  onSearch()
}

async function load() {
  loading.value = true
  try {
    const result = await fetchOutboxMessages({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status || undefined,
      channelKind: query.channelKind || undefined,
      keyword: query.keyword.trim() || undefined,
    })
    list.value = result.list
    total.value = result.total
    stats.value = result.stats
    loadError.value = ''
    syncQuery()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '发送记录加载失败'
  } finally {
    loading.value = false
  }
}

/* 列表筛选/分页写入 URL（刷新与前进后退可恢复），与其他列表页口径一致 */
const { syncQuery } = useListQueryState(query, load)

onMounted(load)

function onSearch() {
  query.page = 1
  void load()
}

/* 清除筛选：供列表空态的「清除筛选」复用，与其它列表页口径一致 */
function onReset() {
  query.status = ''
  query.channelKind = ''
  query.keyword = ''
  onSearch()
}

function onPageChange(pageInfo: { current: number; pageSize: number }) {
  query.page = pageInfo.current
  query.pageSize = pageInfo.pageSize
  void load()
}

const columns = [
  { colKey: 'createdAt', title: '入队时间', width: 170 },
  { colKey: 'templateCode', title: '模板', width: 180 },
  { colKey: 'channelKind', title: '类型', width: 80 },
  /* 收件人多为完整邮箱，列宽需容纳常见长度，避免中途折行 */
  { colKey: 'recipient', title: '收件人', width: 220 },
  { colKey: 'status', title: '状态', width: 120 },
  { colKey: 'attempts', title: '尝试', width: 80 },
  { colKey: 'lastError', title: '失败原因', minWidth: 200 },
  { colKey: 'op', title: '操作', width: 150, fixed: 'right' as const },
]

/* 行级操作互斥：连点重试会多次调用接口造成真实重投递 */
const actingId = ref<string | null>(null)

async function onRetry(row: OutboxMessage) {
  if (actingId.value) return
  actingId.value = row.id
  try {
    await retryOutboxMessage(row.id)
    MessagePlugin.success('已加入待发送')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '重试失败')
  } finally {
    actingId.value = null
  }
}

async function onDiscard(row: OutboxMessage) {
  if (actingId.value) return
  actingId.value = row.id
  try {
    await discardOutboxMessage(row.id)
    MessagePlugin.success('已终止投递')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '终止失败')
  } finally {
    actingId.value = null
  }
}

/* ---------- 投递日志 ---------- */
const logsVisible = ref(false)
const logsLoading = ref(false)
const logsError = ref('')
const logs = ref<OutboxDeliveryLog[]>([])
const logsTarget = ref<OutboxMessage | null>(null)

let logsVersion = 0
async function openLogs(row: OutboxMessage) {
  const request = ++logsVersion
  logsTarget.value = row
  logsVisible.value = true
  logsLoading.value = true
  logsError.value = ''
  logs.value = []
  try {
    const result = await fetchOutboxLogs(row.id)
    if (request === logsVersion) logs.value = result
  } catch (error) {
    if (request === logsVersion) logsError.value = error instanceof Error ? error.message : '投递日志加载失败'
  } finally {
    if (request === logsVersion) logsLoading.value = false
  }
}
</script>

<template>
  <div class="outbox-panel">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <!-- 状态芯片：既是投递概览也是筛选入口（点击筛选、再点取消），固定顺序 + 语义色。
           CheckTag 无 theme prop，语义色经 checked/unchecked 两侧的 TagProps 透传；
           选中态用实心色块（dark）与未选中的描边（light-outline）形成明确区分 -->
    <div class="outbox-chips">
      <t-check-tag
        v-for="chip in statusChips"
        :key="chip.key"
        :checked="query.status === chip.key"
        size="small"
        :checked-props="{ variant: 'dark', theme: chip.theme }"
        :unchecked-props="{ variant: 'light-outline', theme: chip.theme }"
        @change="(checked: boolean) => onStatusChip(chip.key, checked)"
      >
        {{ chip.label }} {{ chip.count }}
      </t-check-tag>
    </div>

    <div class="page-filter-bar">
      <t-select
        v-accessible-field="'类型'"
        v-model="query.channelKind"
        label="类型"
        :options="[{ label: '全部类型', value: '' }, { label: '短信', value: 'sms' }, { label: '邮件', value: 'email' }, { label: '站内信', value: 'inapp' }]"
        class="ctl-w-sm"
        clearable
      />
      <t-input v-accessible-field="'收件人、模板或幂等键搜索'" class="ctl-w-xl"
        v-model="query.keyword"
        clearable
        placeholder="收件人 / 模板 / 幂等键…"
        @enter="onSearch"
      />
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onReset">重置</t-button>
    </div>

    <div class="page-card">
      <t-table row-key="id" :data="list" :columns="columns" :loading="loading" table-layout="fixed" hover resizable
        :pagination="pagination" @page-change="onPageChange">
        <template #templateCode="{ row }">
          <span>{{ row.templateCode || '—' }}</span>
          <t-tag v-if="row.security" theme="warning" variant="light" size="small" class="security-tag">安全</t-tag>
        </template>
        <template #recipient="{ row }">
          <span>{{ row.recipient || '—' }}</span>
        </template>
        <template #channelKind="{ row }">
          <t-tag variant="light-outline" size="small">{{ KIND_LABEL[row.channelKind] || row.channelKind }}</t-tag>
        </template>
        <template #status="{ row }">
          <StatusTag entity="outbox" :value="row.status" />
        </template>
        <template #attempts="{ row }">
          <span>{{ row.attempts }} / {{ row.maxAttempts }}</span>
        </template>
        <template #lastError="{ row }">
          <span class="muted error-text" :title="row.lastError">{{ row.lastError || '—' }}</span>
        </template>
        <template #op="{ row }">
          <t-space size="small">
            <t-button variant="text" size="small" @click="openLogs(row)">日志</t-button>
            <t-button
              v-if="row.status === 'failed' || row.status === 'dead' || row.status === 'skipped'"
              variant="text"
              size="small"
              :disabled="actingId === row.id"
              @click="onRetry(row)"
            >
              {{ actingId === row.id ? '重试中…' : '重试' }}
            </t-button>
            <!-- 终止投递不可逆（不再重试），补二次确认 -->
            <t-popconfirm
              v-if="row.status === 'pending' || row.status === 'failed'"
              theme="danger"
              content="确认终止该投递？终止后不再重试且不可恢复"
              @confirm="onDiscard(row)"
            >
              <t-button variant="text" size="small" theme="danger">终止</t-button>
            </t-popconfirm>
          </t-space>
        </template>

        <template #empty>
          <ListEmptyState :query="query" description="暂无发送记录" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <t-dialog v-model:visible="logsVisible" header="投递日志" width="720px" :footer="false">
      <t-loading :loading="logsLoading" size="small">
        <div class="logs-target" v-if="logsTarget">
          {{ logsTarget.templateCode }} → {{ logsTarget.recipient }}
        </div>
        <ListErrorState v-if="logsError" :message="logsError" :loading="logsLoading" @retry="logsTarget && openLogs(logsTarget)" />
        <t-table v-else
          row-key="id"
          :data="logs"
          :columns="[
            { colKey: 'at', title: '时间', width: 170 },
            { colKey: 'attempt', title: '第几次', width: 90 },
            { colKey: 'status', title: '结果', width: 100 },
            { colKey: 'costMs', title: '耗时', width: 90 },
            { colKey: 'error', title: '详情' },
          ]"
          table-layout="fixed"
          hover
        >
          <template #costMs="{ row }">{{ row.costMs }}ms</template>
          <template #error="{ row }">
            <span class="muted">{{ row.error || row.providerMessageId || '—' }}</span>
          </template>
          <template #empty>
            <t-empty description="暂无投递日志" size="small" />
          </template>
        </t-table>
      </t-loading>
    </t-dialog>
  </div>
</template>

<style scoped>
/* 状态芯片行：与筛选条同宽，间距 8px（4px 基数） */
.outbox-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.muted {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.error-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.security-tag {
  margin-left: 8px;
}

.logs-target {
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--td-text-color-primary);
}
</style>
