<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import {
  discardOutboxMessage,
  fetchOutboxLogs,
  fetchOutboxMessages,
  retryOutboxMessage,
} from '@/api/messageOutbox'
import { useListQueryState } from '@/utils/listQuery'
import type { OutboxDeliveryLog, OutboxMessage, OutboxStatus } from '@/types'

/* 消息中心 · 发送记录（P0 Outbox）：投递状态 / 失败原因 / 投递日志 / 手动重试与终止。
 * 重试退避与死信由后端调度任务自动处理，此处用于人工干预与排障。 */
defineProps<{ inline?: boolean }>()
const loading = ref(true)
const loadError = ref('')
const list = ref<OutboxMessage[]>([])
const total = ref(0)
const stats = ref<Record<string, number>>({})

const KIND_LABEL: Record<string, string> = { sms: '短信', email: '邮件', inapp: '站内信' }
const STATUS_LABEL: Record<string, string> = {
  pending: '待发送',
  sending: '发送中',
  sent: '已送达',
  failed: '待重试',
  dead: '死信',
  skipped: '已跳过',
}
const STATUS_THEME: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = {
  pending: 'default',
  sending: 'primary',
  sent: 'success',
  failed: 'warning',
  dead: 'danger',
  skipped: 'default',
}

const query = reactive({ page: 1, pageSize: 20, status: '' as OutboxStatus | '', channelKind: '', keyword: '' })

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

function onPageChange(pageInfo: { current: number; pageSize: number }) {
  query.page = pageInfo.current
  query.pageSize = pageInfo.pageSize
  void load()
}

const columns = [
  { colKey: 'createdAt', title: '入队时间', width: 170 },
  { colKey: 'templateCode', title: '模板', width: 160 },
  { colKey: 'channelKind', title: '类型', width: 80 },
  { colKey: 'recipient', title: '收件人', width: 170 },
  { colKey: 'status', title: '状态', width: 130 },
  { colKey: 'attempts', title: '尝试', width: 80 },
  { colKey: 'lastError', title: '失败原因' },
  { colKey: 'op', title: '操作', width: 180, fixed: 'right' as const },
]

async function onRetry(row: OutboxMessage) {
  try {
    await retryOutboxMessage(row.id)
    MessagePlugin.success('已加入待发送')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '重试失败')
  }
}

async function onDiscard(row: OutboxMessage) {
  try {
    await discardOutboxMessage(row.id)
    MessagePlugin.success('已终止投递')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '终止失败')
  }
}

/* ---------- 投递日志 ---------- */
const logsVisible = ref(false)
const logsLoading = ref(false)
const logs = ref<OutboxDeliveryLog[]>([])
const logsTarget = ref<OutboxMessage | null>(null)

async function openLogs(row: OutboxMessage) {
  logsTarget.value = row
  logsVisible.value = true
  logsLoading.value = true
  try {
    logs.value = await fetchOutboxLogs(row.id)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '投递日志加载失败')
    logs.value = []
  } finally {
    logsLoading.value = false
  }
}
</script>

<template>
  <div class="outbox-panel" :class="{ 'page-fade-in': true }">
    <PageHeader v-if="!$props.inline" title="发送记录" description="消息投递状态与投递日志；重试退避与死信由后台定时任务自动执行">
      <template #actions>
        <t-space size="small">
          <t-tag v-for="(count, key) in stats" :key="key" variant="light-outline" size="small">
            {{ STATUS_LABEL[key] || key }} {{ count }}
          </t-tag>
        </t-space>
      </template>
    </PageHeader>

    <t-card :bordered="true" class="outbox-card">
      <t-space class="filters" size="small" break-line>
        <t-select
          v-model="query.status"
          :options="[{ label: '全部状态', value: '' }, ...Object.keys(STATUS_LABEL).map((k) => ({ label: STATUS_LABEL[k], value: k }))]"
          style="width: 150px"
          @change="onSearch"
        />
        <t-select
          v-model="query.channelKind"
          :options="[{ label: '全部类型', value: '' }, { label: '短信', value: 'sms' }, { label: '邮件', value: 'email' }, { label: '站内信', value: 'inapp' }]"
          style="width: 130px"
          @change="onSearch"
        />
        <t-input
          v-model="query.keyword"
          clearable
          placeholder="收件人 / 模板 / 幂等键…"
          style="width: 240px"
          @enter="onSearch"
        />
        <t-button theme="primary" variant="outline" @click="onSearch">查询</t-button>
      </t-space>

      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

      <t-table row-key="id" :data="list" :columns="columns" :loading="loading" table-layout="fixed" hover>
        <template #templateCode="{ row }">
          <span>{{ row.templateCode }}</span>
          <t-tag v-if="row.security" theme="warning" variant="light" size="small" class="security-tag">安全</t-tag>
        </template>
        <template #channelKind="{ row }">
          <t-tag variant="light-outline" size="small">{{ KIND_LABEL[row.channelKind] || row.channelKind }}</t-tag>
        </template>
        <template #status="{ row }">
          <t-tag :theme="STATUS_THEME[row.status] || 'default'" variant="light" size="small">
            {{ STATUS_LABEL[row.status] || row.status }}
          </t-tag>
        </template>
        <template #attempts="{ row }">
          <span>{{ row.attempts }} / {{ row.maxAttempts }}</span>
        </template>
        <template #lastError="{ row }">
          <span class="muted error-text">{{ row.lastError || '—' }}</span>
        </template>
        <template #op="{ row }">
          <t-space size="small">
            <t-link theme="primary" hover="color" @click="openLogs(row)">日志</t-link>
            <t-link
              v-if="row.status === 'failed' || row.status === 'dead' || row.status === 'skipped'"
              theme="primary"
              hover="color"
              @click="onRetry(row)"
            >
              重试
            </t-link>
            <t-link
              v-if="row.status === 'pending' || row.status === 'failed'"
              theme="danger"
              hover="color"
              @click="onDiscard(row)"
            >
              终止
            </t-link>
          </t-space>
        </template>
      </t-table>

      <div class="pager">
        <t-pagination
          :current="query.page"
          :page-size="query.pageSize"
          :total="total"
          :page-size-options="[20, 50, 100]"
          @change="onPageChange"
        />
      </div>
    </t-card>

    <t-dialog v-model:visible="logsVisible" header="投递日志" width="720px" :footer="false">
      <t-loading :loading="logsLoading" size="small">
        <div class="logs-target" v-if="logsTarget">
          {{ logsTarget.templateCode }} → {{ logsTarget.recipient }}
        </div>
        <t-table
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
        </t-table>
        <t-empty v-if="!logsLoading && !logs.length" description="暂无投递日志" size="small" />
      </t-loading>
    </t-dialog>
  </div>
</template>

<style scoped>
.outbox-card {
  width: 100%;
}

.filters {
  margin-bottom: 16px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
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
  margin-left: 6px;
}

.logs-target {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--td-text-color-primary);
}
</style>
