<script setup lang="ts">
import ListErrorState from '@/components/ListErrorState.vue'
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import {
  fetchCronLogs,
  fetchMonitorOverview,
  runCronJob,
  type CronJobStatus,
  type CronRunLog,
  type MonitorOverview,
} from '@/api/monitor'

/* 系统监控：服务健康 / Redis 概览 / 定时任务执行情况（真实接口 /api/admin/monitor）。 */
const loading = ref(false)
const loadError = ref('')
const overview = ref<MonitorOverview | null>(null)
const job = ref<CronJobStatus | null>(null)

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    overview.value = await fetchMonitorOverview()
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

/* ---------- 服务健康 ---------- */
const uptimeText = computed(() => {
  const s = overview.value?.service.uptimeSec
  if (s == null) return '—'
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const mins = Math.floor((s % 3600) / 60)
  return days > 0 ? `${days} 天 ${hours} 时` : hours > 0 ? `${hours} 时 ${mins} 分` : `${mins} 分`
})

function statusTag(s?: string) {
  const map: Record<string, { theme: 'success' | 'warning' | 'danger'; label: string }> = {
    healthy: { theme: 'success', label: '健康' },
    degraded: { theme: 'warning', label: '亚健康' },
    down: { theme: 'danger', label: '异常' },
  }
  return map[s ?? ''] ?? { theme: 'default' as const, label: '—' }
}

/* StatCard 数值颜色：健康绿 / 亚健康橙 / 异常红（TStatistic 颜色风格） */
const STATUS_STAT_COLOR: Record<string, string | undefined> = {
  success: 'green',
  warning: 'orange',
  danger: 'red',
  default: undefined,
}

const serviceStatusLabel = computed(() => statusTag(overview.value?.service.status).label)
const serviceStatusColor = computed(() => STATUS_STAT_COLOR[statusTag(overview.value?.service.status).theme])

/** 数值+单位整体判空：空值/加载中显示 —（不带单位尾巴） */
const apiLatencyText = computed(() => {
  const v = overview.value?.service.apiLatencyMs
  return v == null ? '—' : `${v} ms`
})

const dbRedisText = computed(() => {
  const db = overview.value?.service.db.latencyMs
  const redis = overview.value?.service.redis.latencyMs
  return `PostgreSQL ${db == null ? '—' : `${db}ms`} · Redis ${redis == null ? '—' : `${redis}ms`}`
})

/** 数据库/缓存健康标签：由真实 status/latency 派生，缺数据或异常时不得显示成功态 */
const dbRedisHealth = computed<{ theme: 'success' | 'warning' | 'danger' | 'default'; label: string }>(() => {
  const db = overview.value?.service.db
  const redis = overview.value?.service.redis
  if (!db || !redis) return { theme: 'default', label: '—' }
  if (db.status === 'down' && redis.status === 'down') return { theme: 'danger', label: '数据库与缓存不可用' }
  if (db.status === 'down') return { theme: 'danger', label: '数据库不可用' }
  if (redis.status === 'down') return { theme: 'danger', label: '缓存不可用' }
  if (!Number.isFinite(db.latencyMs) || !Number.isFinite(redis.latencyMs)) return { theme: 'warning', label: '状态未知' }
  return { theme: 'success', label: '连接正常' }
})

/* ---------- Redis ---------- */
const hitRatePct = computed(() => Math.round((overview.value?.redis.hitRate ?? 0) * 100))

/* ---------- 定时任务 ---------- */
const jobColumns = [
  { colKey: 'name', title: '任务名称', width: 260, resizable: true , ellipsis: true},
  { colKey: 'cron', title: '调度周期', width: 120 , ellipsis: true},
  { colKey: 'lastRunAt', title: '上次执行', width: 170, resizable: true , ellipsis: true},
  { colKey: 'lastRunDurationMs', title: '耗时', cell: 'duration', width: 90 , ellipsis: true},
  { colKey: 'lastResult', title: '结果', cell: 'result', width: 90 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 170 },
]

/* ---------- 手动执行（运维调试）：失败透出 500，执行结果写入 SchedulerLog ---------- */
const runningJob = ref('')

async function onRunJob(row: CronJobStatus) {
  if (runningJob.value) return
  runningJob.value = row.name
  try {
    await runCronJob(row.name)
    MessagePlugin.success(`已执行「${row.name}」`)
    await load(true)
    if (job.value?.name === row.name) logs.value = await fetchCronLogs(row.name)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '任务执行失败')
  } finally {
    runningJob.value = ''
  }
}

/* ---------- 执行日志抽屉 ---------- */
const logVisible = ref(false)
const logs = ref<CronRunLog[]>([])
const logLoading = ref(false)
const logError = ref('')

async function openLogs(row: CronJobStatus) {
  if (job.value?.name !== row.name) logs.value = []
  job.value = row
  logVisible.value = true
  logLoading.value = true
  try {
    logs.value = await fetchCronLogs(row.name)
    logError.value = ''
  } catch (e) {
    logError.value = e instanceof Error ? e.message : '执行日志加载失败'
  } finally {
    logLoading.value = false
  }
}

const logColumns = [
  { colKey: 'runAt', title: '执行时间', width: 170 , ellipsis: true},
  { colKey: 'durationMs', title: '耗时', width: 90 , ellipsis: true},
  { colKey: 'result', title: '结果', cell: 'result', width: 90 , ellipsis: true},
  { colKey: 'detail', title: '执行说明' , ellipsis: true},
]

onMounted(load)
</script>

<template>
  <div class="monitor-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="系统监控" description="服务健康、Redis 缓存与定时任务执行情况一览">
    </PageHeader>

    <t-loading :loading="loading" size="small">
      <!-- 服务健康卡（共享 StatCard，保留四列响应式布局） -->
      <div class="monitor-stat-row">
        <StatCard label="服务状态" :value="serviceStatusLabel" :color="serviceStatusColor">
          <template #sub>{{ overview?.service.name }} · v{{ overview?.service.version }} · {{ overview?.service.nodeEnv }}</template>
        </StatCard>
        <StatCard label="已运行" :value="uptimeText">
          <template #sub>启动于 {{ overview?.service.startedAt || '—' }}</template>
        </StatCard>
        <StatCard label="接口平均延迟" :value="apiLatencyText">
          <template #sub>近 5 分钟窗口</template>
        </StatCard>
        <StatCard label="数据库 / 缓存" :value="dbRedisText">
          <template #sub>
            <t-tag size="small" :theme="dbRedisHealth.theme" variant="light">{{ dbRedisHealth.label }}</t-tag>
          </template>
        </StatCard>
      </div>

      <!-- Redis 概览 -->
      <t-card title="Redis 缓存概览" class="redis-card" :bordered="false">
        <div class="redis-grid">
          <div class="redis-cell">
            <div class="redis-label">内存占用（当前 / 峰值）</div>
            <div class="redis-value">
              {{ overview?.redis.usedMemory }} <span class="redis-muted">/ {{ overview?.redis.usedMemoryPeak }}</span>
            </div>
            <div class="redis-sub">机器总内存 {{ overview?.redis.totalSystemMemory }}</div>
          </div>
          <div class="redis-cell">
            <div class="redis-label">缓存命中率</div>
            <div class="redis-value">{{ hitRatePct }}%</div>
            <t-progress :percentage="hitRatePct" :color="hitRatePct > 80 ? 'var(--td-success-color)' : 'var(--td-warning-color)'" :stroke-width="8" :show-label="false" />
          </div>
          <div class="redis-cell">
            <div class="redis-label">键数量</div>
            <div class="redis-value">{{ overview?.redis.keys.toLocaleString('zh-CN') }}</div>
            <div class="redis-sub">客户端连接 {{ overview?.redis.connectedClients.toLocaleString('zh-CN') }}</div>
          </div>
          <div class="redis-cell">
            <div class="redis-label">版本 / 运行</div>
            <div class="redis-value">{{ overview?.redis.version }}</div>
            <div class="redis-sub">已运行 {{ overview?.redis.uptimeDays }} 天</div>
          </div>
        </div>
      </t-card>

      <!-- 定时任务 -->
      <t-card title="定时任务" class="cron-card" :bordered="false">
        <t-table
          row-key="name"
          hover
          table-layout="fixed"
          resizable
          :data="overview?.jobs ?? []"
          :columns="jobColumns"
          :loading="loading"
          empty="暂无定时任务"
        >
          <template #duration="{ row }">{{ row.lastRunDurationMs }} ms</template>
          <template #result="{ row }">
            <StatusTag v-if="row.lastResult === 'success' || row.lastResult === 'failed'" entity="cron" :value="row.lastResult" />
            <span v-else class="muted">暂无</span>
          </template>
          <template #op="{ row }">
            <t-button variant="text" size="small" @click="openLogs(row)">执行日志</t-button>
            <t-popconfirm content="确认立即执行该定时任务？" @confirm="onRunJob(row)">
              <t-button variant="text" size="small" theme="primary" :loading="runningJob === row.name">手动执行</t-button>
            </t-popconfirm>
          </template>
        </t-table>
      </t-card>
    </t-loading>

    <!-- 执行日志抽屉 -->
    <t-drawer
      v-model:visible="logVisible"
      :header="`执行日志 · ${job?.name ?? ''}`"
      size="560px"
      :close-btn="true"
      :close-on-esc-keydown="true"
      :footer="false"
    >
      <ListErrorState v-if="logError" :message="logError" :loading="logLoading" @retry="job && openLogs(job)" />
      <t-table
        row-key="id"
        hover
        table-layout="fixed"
        :data="logs"
        :columns="logColumns"
        :loading="logLoading"
        size="small"
        empty="暂无执行记录"
      >
        <template #result="{ row }">
          <StatusTag entity="cron" :value="row.result" size="small" />
        </template>
      </t-table>
      <p class="log-tip">仅保留最近执行记录；失败任务可结合后端日志定位。</p>
    </t-drawer>
  </div>
</template>

<style scoped>
.monitor-stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.muted {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

@media (max-width: 1199px) {
  .monitor-stat-row,
  .redis-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .monitor-stat-row,
  .redis-grid {
    grid-template-columns: 1fr;
  }
}

.redis-card {
  margin-bottom: 16px;
}

.redis-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.redis-cell {
  min-width: 0;
}

.redis-label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.redis-value {
  margin: 6px 0 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.redis-muted {
  font-size: 14px;
  font-weight: 400;
  color: var(--td-text-color-placeholder);
}

.redis-sub {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.log-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
