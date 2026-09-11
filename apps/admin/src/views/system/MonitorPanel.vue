<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import {
  fetchCronLogs,
  fetchMonitorOverview,
  type CronJobStatus,
  type CronRunLog,
  type MonitorOverview,
} from '@/api/monitor'

/* 系统监控：服务健康 / Redis 概览 / 定时任务执行情况（真实接口 /api/admin/monitor）。 */
const loading = ref(false)
const overview = ref<MonitorOverview | null>(null)
const job = ref<CronJobStatus | null>(null)

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    overview.value = await fetchMonitorOverview()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '监控数据加载失败')
  } finally {
    loading.value = false
  }
}

/* ---------- 服务健康 ---------- */
const uptimeText = computed(() => {
  const s = overview.value?.service.uptimeSec ?? 0
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

/* ---------- Redis ---------- */
const hitRatePct = computed(() => Math.round((overview.value?.redis.hitRate ?? 0) * 100))

/* ---------- 定时任务 ---------- */
const jobColumns = [
  { colKey: 'name', title: '任务名称', width: 260, resizable: true , ellipsis: true},
  { colKey: 'cron', title: '调度周期', width: 120 , ellipsis: true},
  { colKey: 'lastRunAt', title: '上次执行', width: 170, resizable: true , ellipsis: true},
  { colKey: 'lastRunDurationMs', title: '耗时', cell: 'duration', width: 90 , ellipsis: true},
  { colKey: 'lastResult', title: '结果', cell: 'result', width: 90 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 100 },
]

/* ---------- 执行日志抽屉 ---------- */
const logVisible = ref(false)
const logs = ref<CronRunLog[]>([])
const logLoading = ref(false)

async function openLogs(row: CronJobStatus) {
  job.value = row
  logVisible.value = true
  logLoading.value = true
  try {
    logs.value = await fetchCronLogs(row.name)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '执行日志加载失败')
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
    <PageHeader title="系统监控" description="服务健康、Redis 缓存与定时任务执行情况一览">
    </PageHeader>

    <div v-loading="loading">
      <!-- 服务健康卡 -->
      <div class="stat-row">
        <div class="stat-card">
          <div class="stat-label">服务状态</div>
          <div class="stat-value">
            <t-tag :theme="statusTag(overview?.service.status).theme" variant="light" size="medium">
              {{ statusTag(overview?.service.status).label }}
            </t-tag>
          </div>
          <div class="stat-sub">
            {{ overview?.service.name }} · v{{ overview?.service.version }} · {{ overview?.service.nodeEnv }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">已运行</div>
          <div class="stat-value">{{ uptimeText }}</div>
          <div class="stat-sub">启动于 {{ overview?.service.startedAt }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">接口平均延迟</div>
          <div class="stat-value">{{ overview?.service.apiLatencyMs ?? '—' }} ms</div>
          <div class="stat-sub">近 5 分钟窗口</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">数据库 / 缓存</div>
          <div class="stat-value">
            <span>PostgreSQL {{ overview?.service.db.latencyMs }}ms</span>
            <span class="dot-space">·</span>
            <span>Redis {{ overview?.service.redis.latencyMs }}ms</span>
          </div>
          <div class="stat-sub">
            <t-tag size="small" theme="success" variant="light">连接正常</t-tag>
          </div>
        </div>
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
            <div class="redis-value">{{ overview?.redis.keys.toLocaleString() }}</div>
            <div class="redis-sub">客户端连接 {{ overview?.redis.connectedClients }}</div>
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
          :data="overview?.jobs ?? []"
          :columns="jobColumns"
          :loading="loading"
          empty="暂无定时任务"
        >
          <template #duration="{ row }">{{ row.lastRunDurationMs }} ms</template>
          <template #result="{ row }">
            <t-tag
              :theme="row.lastResult === 'success' ? 'success' : row.lastResult === 'failed' ? 'danger' : 'default'"
              variant="light"
              size="small"
            >
              {{ row.lastResult === 'success' ? '成功' : row.lastResult === 'failed' ? '失败' : '暂无' }}
            </t-tag>
          </template>
          <template #op="{ row }">
            <t-button variant="text" size="small" @click="openLogs(row)">执行日志</t-button>
          </template>
        </t-table>
      </t-card>
    </div>

    <!-- 执行日志抽屉 -->
    <t-drawer
      v-model:visible="logVisible"
      :header="`执行日志 · ${job?.name ?? ''}`"
      size="560px"
      :close-btn="true"
      :close-on-esc-keydown="true"
    >
      <t-table
        row-key="id"
        hover
        :data="logs"
        :columns="logColumns"
        :loading="logLoading"
        size="small"
        empty="暂无执行记录"
      >
        <template #result="{ row }">
          <t-tag :theme="row.result === 'success' ? 'success' : 'danger'" variant="light" size="small">
            {{ row.result === 'success' ? '成功' : '失败' }}
          </t-tag>
        </template>
      </t-table>
      <p class="log-tip">仅保留最近执行记录；失败任务可结合后端日志定位。</p>
    </t-drawer>
  </div>
</template>

<style scoped>
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  padding: 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-container);
}

.stat-label {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.stat-value {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 8px 0 4px;
  font-size: 22px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.dot-space {
  color: var(--td-text-color-placeholder);
  font-weight: 400;
}

.stat-sub {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
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
  font-size: 13px;
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