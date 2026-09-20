<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { fetchMyLeases } from '@/api/leases'
import ListSkeleton from '@/components/ListSkeleton.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { formatZhNumber } from '@/utils/format'

const { data, loading, error, run } = useAsyncList(fetchMyLeases)
const leases = computed(() => data.value ?? [])

const renterTypeLabels = { individual: '个人租约', enterprise: '企业租约' } as const
const rentPeriodLabels = { day: '日', week: '周', month: '月', year: '年' } as const

function leasePeriod(longTerm: boolean, startDate: string, endDate: string): string {
  return longTerm ? `${startDate} 起 · 长期` : `${startDate} 至 ${endDate}`
}

onMounted(run)
</script>

<template>
  <div class="page-fade-in my-leases">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!leases.length" text="暂无与你相关的租约记录" />
    <div v-else class="stagger lease-list">
      <p class="list-count">共 {{ formatZhNumber(leases.length) }} 条</p>
      <article v-for="lease in leases" :key="lease.id" class="m-card lease-card">
        <div class="card-head">
          <div class="title-wrap">
            <p class="lease-type">{{ renterTypeLabels[lease.renterType] }}</p>
            <h2>{{ lease.renterName }}</h2>
          </div>
          <StateTag kind="lease" :value="lease.status" />
        </div>

        <dl class="details">
          <div>
            <dt>租约编号</dt>
            <dd><span class="id-tag">{{ lease.id }}</span></dd>
          </div>
          <div>
            <dt>办公位</dt>
            <dd>{{ lease.workstationLabels.length ? lease.workstationLabels.join('、') : '未分配' }}</dd>
          </div>
          <div>
            <dt>租期</dt>
            <dd>{{ leasePeriod(lease.longTerm, lease.startDate, lease.endDate) }}</dd>
          </div>
          <div>
            <dt>租金</dt>
            <dd class="rent">¥{{ formatZhNumber(lease.monthlyRent) }} / {{ rentPeriodLabels[lease.rentPeriod] }}</dd>
          </div>
          <div>
            <dt>联系人</dt>
            <dd>{{ lease.contactName }} · {{ lease.contactPhone }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </div>
</template>

<style scoped>
.my-leases {
  padding: var(--app-space-8);
}

.lease-list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
}

.lease-card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-5);
}

.title-wrap {
  min-width: 0;
}

.lease-type {
  margin: 0 0 var(--app-space-2);
  color: var(--td-text-color-secondary);
  font-size: var(--app-font-caption);
}

h2 {
  margin: 0;
  font-size: var(--app-font-body);
  overflow-wrap: anywhere;
}

.details {
  display: grid;
  gap: var(--app-space-4);
  margin: 0;
}

.details > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--app-space-4);
  align-items: baseline;
}

dt,
dd {
  margin: 0;
  font-size: var(--app-font-body);
}

dt {
  color: var(--td-text-color-secondary);
}

dd {
  min-width: 0;
  color: var(--td-text-color-primary);
  overflow-wrap: anywhere;
}

.rent {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
