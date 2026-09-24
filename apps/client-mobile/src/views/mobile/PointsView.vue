<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, List, Search, Toast } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { fetchPointsRecords } from '@/api/me'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { pointsSourceLabel } from '@/constants/points'
import type { PointsRecord } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 移动积分流水：余额卡（可去积分商城）+ 来源/事由搜索（防抖 300ms）+ 分页流水列表（含余额快照）
 * v38：改为分页加载（首屏 20 条 + 加载更多 + 总数），不再静默截断 50 条。 */
const router = useRouter()
const auth = useAuthStore()
const keyword = ref('')

const PAGE_SIZE = 20
const items = ref<PointsRecord[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')
let requestId = 0

async function load(reset = false) {
  const id = ++requestId
  if (reset) {
    page.value = 1
    items.value = []
    total.value = 0
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetchPointsRecords({ page: page.value, pageSize: PAGE_SIZE, keyword: keyword.value.trim() || undefined })
    if (id !== requestId) return
    items.value = page.value === 1 ? res.list : items.value.concat(res.list)
    total.value = res.total
  } catch (e) {
    if (id !== requestId) return
    error.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
  } finally {
    if (id === requestId) loading.value = false
  }
}

onMounted(() => {
  void auth.refreshProfile()
  void load(true)
})

let timer: number | undefined
watch(keyword, () => {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void load(true), 300)
})
onBeforeUnmount(() => window.clearTimeout(timer))

const firstLoading = computed(() => loading.value && items.value.length === 0)
const hasMore = computed(() => items.value.length < total.value)
const footerState = computed(() => {
  if (!items.value.length || error.value) return ''
  if (loading.value) return 'loading'
  return hasMore.value ? 'load-more' : ''
})

function loadMore() {
  if (!hasMore.value || loading.value) return
  const prev = page.value
  page.value = prev + 1
  void load().then(() => {
    /* v41：失败回退页码并保留已有流水 */
    if (error.value) {
      page.value = prev
      Toast(error.value)
      error.value = ''
    }
  })
}

function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}
</script>

<template>
  <div class="page-fade-in points">
    <div class="balance-card">
      <span class="label">当前积分</span>
      <b class="value tabular-nums">{{ formatZhNumber(auth.points) }}</b>
    </div>

    <Button theme="primary" variant="outline" block class="mall-link" @click="router.push('/mall')">去积分商城兑换</Button>
    <div class="quick-links">
      <Button size="small" variant="text" @click="router.push('/mall/rules')">积分规则</Button>
    </div>

    <Search v-model="keyword" class="ledger-search" placeholder="搜索来源或事由…" />

    <ListSkeleton v-if="firstLoading" />
    <EmptyBlock v-else-if="error && !items.length" :text="error" action-text="重试" @action="() => load(true)" />
    <EmptyBlock
      v-else-if="!items.length"
      :text="keyword ? '暂无匹配流水' : '暂无积分流水'"
      :action-text="keyword ? '清除搜索' : undefined"
      @action="keyword = ''"
    />
    <template v-else>
      <p class="ledger-count">共 {{ formatZhNumber(total) }} 条流水</p>
      <List class="m-card ledger stagger" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
        <div v-for="r in items" :key="r.id" class="row">
          <div class="main">
            <p class="reason">{{ r.reason }}</p>
            <p class="meta">{{ pointsSourceLabel(r.source) }} · {{ formatLocalDateTime(r.at) }}</p>
          </div>
          <div class="side">
            <span class="delta tabular-nums" :class="{ neg: r.delta < 0 }">{{ r.delta >= 0 ? '+' : '' }}{{ formatZhNumber(r.delta) }}</span>
            <span class="balance tabular-nums">余额 {{ formatZhNumber(r.balance) }}</span>
          </div>
        </div>
      </List>
      <p v-if="!hasMore" class="ledger-end">已加载全部</p>
    </template>
  </div>
</template>

<style scoped>
.quick-links {
  display: flex;
  justify-content: center;
  gap:var(--app-space-4);
}

.points {
  padding:var(--app-space-8);
}

.ledger-count {
  margin:0 0 var(--app-space-4);
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.ledger-end {
  margin:var(--app-space-6) 0 0;
  text-align: center;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.balance-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding:var(--app-space-11);
  border-radius: var(--td-radius-large);
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
  margin-bottom:var(--app-space-7);
}

.label {
  font: var(--app-type-body-sm);
  opacity: 0.85;
}

.value {
  font: var(--app-type-numeric-lg);
}

.ledger-search {
  margin-bottom:var(--app-space-6);
}

.mall-link {
  margin-bottom:var(--app-space-7);
}


.ledger {
  padding:var(--app-space-2) var(--app-space-7);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-5);
  padding:var(--app-space-6) 0;
}

/* List 组件会在行尾常驻一个 loading wrapper 节点，:last-child 判定失效，改用相邻行画上边框（视觉等价） */
.row + .row {
  border-top: 1px solid var(--td-component-border);
}

.reason {
  margin:0 0 var(--app-space-2);
  font: var(--app-type-body);
}

.meta {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.side {
  text-align: right;
}

.delta {
  color: var(--td-success-color);
  font: var(--app-type-emphasis);
}

.delta.neg {
  color: var(--td-error-color);
}

.balance {
  display: block;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}
</style>
