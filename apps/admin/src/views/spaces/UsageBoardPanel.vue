<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import StatCard from '@/components/StatCard.vue'
import { fetchSpaceUsageBoard, fetchSpaces, type SpaceOccupancy } from '@/api/spaces'
import { spaceTypeMap } from '@/constants/status'
import type { Space } from '@/types'

/* 使用看板：指定日期的空间占用视图 = 当日已通过预约 + 同名空间当日已发布社区活动（合并展示，来源标签区分） */
function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const loading = ref(false)
const spaces = ref<Space[]>([])
const occupancy = ref<SpaceOccupancy[]>([])
const date = ref(today())

const occupiedSpaceIds = computed(() => new Set(occupancy.value.map((o) => o.spaceId)))
const freeCount = computed(() => spaces.value.filter((s) => s.status === 'available' && !occupiedSpaceIds.value.has(s.id)).length)

/* 按空间分组展示占用明细 */
const spaceBoard = computed(() =>
  spaces.value.map((s) => ({
    space: s,
    entries: occupancy.value.filter((o) => o.spaceId === s.id),
  })),
)

async function load() {
  loading.value = true
  try {
    const [ss, board] = await Promise.all([fetchSpaces(), fetchSpaceUsageBoard(date.value)])
    spaces.value = ss
    occupancy.value = board
  } finally {
    loading.value = false
  }
}

watch(date, load)
onMounted(load)
</script>

<template>
  <div class="usage-board-panel">
    <div class="page-filter-bar">
      <t-date-picker v-model="date" valueType="YYYY-MM-DD" :clearable="false" style="width: 180px" />
      <span class="panel-tip">占用 = 当日已通过的空间预约 + 同名空间当日已发布的社区活动；数据随空间与活动实时联动。</span>
    </div>

    <div class="stat-row">
      <StatCard label="占用空间数" :value="occupiedSpaceIds.size" />
      <StatCard label="空闲空间数" :value="freeCount" />
      <StatCard label="占用条目" :value="occupancy.length" />
    </div>

    <t-loading :loading="loading" size="small">
      <div class="board-grid">
      <div v-for="{ space, entries } in spaceBoard" :key="space.id" class="board-card">
        <div class="board-head">
          <div>
            <div class="board-name">{{ space.name }}</div>
            <div class="board-sub">
              {{ spaceTypeMap[space.type] ?? space.type }} · {{ space.location }} ·
              {{ space.allDay ? '全天开放' : `${space.openTime} ~ ${space.closeTime}` }}
            </div>
          </div>
          <t-tag v-if="entries.length === 0 && space.status === 'available'" theme="success" variant="light">
            当日空闲
          </t-tag>
          <t-tag v-if="space.status === 'maintenance'" theme="warning" variant="light">维护中</t-tag>
          <t-tag v-if="space.status === 'disabled'" variant="light">已停用</t-tag>
        </div>
        <div v-if="entries.length > 0" class="board-list">
          <div v-for="(e, i) in entries" :key="i" class="board-entry">
            <span class="entry-time">{{ e.startTime }} ~ {{ e.endTime }}</span>
            <span class="entry-title" :title="e.title">{{ e.title }}</span>
            <span class="entry-organizer">{{ e.organizer }}</span>
            <t-tag v-if="e.source === 'event'" theme="primary" variant="light" size="small">社区活动</t-tag>
            <t-tag v-else theme="success" variant="light" size="small">空间预约</t-tag>
          </div>
        </div>
        <div v-else-if="space.status === 'available'" class="board-empty">暂无占用安排</div>
      </div>
      </div>
    </t-loading>
  </div>
</template>

<style scoped>
.panel-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}

.board-card {
  padding: 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-container);
}

.board-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.board-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.board-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.board-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.board-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-secondarycontainer);
  font-size: 13px;
}

.entry-time {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-primary);
  font-weight: 600;
}

.entry-title {
  flex: 1;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-organizer {
  flex: none;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.board-empty {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
