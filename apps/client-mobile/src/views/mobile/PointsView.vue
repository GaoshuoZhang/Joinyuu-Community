<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Loading, Search } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchPointsRecords } from '@/api/me'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* 移动积分流水：余额卡（可去积分商城）+ 来源/事由搜索（防抖 300ms）+ 流水列表（含余额快照） */
const router = useRouter()
const auth = useAuthStore()
const keyword = ref('')

const { data, loading, error, run } = useAsyncList(() =>
  fetchPointsRecords({ page: 1, pageSize: 50, keyword: keyword.value.trim() || undefined }),
)
onMounted(() => {
  void auth.refreshProfile()
  run()
})

let timer: number | undefined
watch(keyword, () => {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => run(), 300)
})
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div class="page-fade-in points">
    <div class="balance-card">
      <span class="label">当前积分</span>
      <b class="value">{{ auth.points.toLocaleString('zh-CN') }}</b>
    </div>

    <Button theme="primary" variant="outline" block class="mall-link" @click="router.push('/mall')">去积分商城兑换</Button>

    <Search v-model="keyword" class="ledger-search" placeholder="搜索来源或事由" />

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <EmptyBlock v-else-if="!data?.list.length" :text="keyword ? '暂无匹配流水' : '暂无积分流水'" />
    <div v-else class="m-card ledger stagger">
      <div v-for="r in data.list" :key="r.id" class="row">
        <div class="main">
          <p class="reason">{{ r.reason }}</p>
          <p class="meta">{{ r.source }} · {{ r.at }}</p>
        </div>
        <div class="side">
          <span class="delta" :class="{ neg: r.delta < 0 }">{{ r.delta >= 0 ? '+' : '' }}{{ r.delta }}</span>
          <span class="balance">余额 {{ r.balance }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.points {
  padding: 16px;
}

.balance-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px;
  border-radius: var(--td-radius-large);
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
  margin-bottom: 14px;
}

.label {
  font-size: 12px;
  opacity: 0.85;
}

.value {
  font-size: 30px;
  font-weight: 700;
}

.ledger-search {
  margin-bottom: 12px;
}

.mall-link {
  margin-bottom: 14px;
}

.state {
  padding: 20px 0;
}

.ledger {
  padding: 4px 14px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid var(--td-component-border);
}

.row:last-child {
  border-bottom: none;
}

.reason {
  margin: 0 0 3px;
  font-size: 13px;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.side {
  text-align: right;
}

.delta {
  font-weight: 700;
  color: var(--td-success-color);
  font-size: 14px;
}

.delta.neg {
  color: var(--td-error-color);
}

.balance {
  display: block;
  font-size: 10px;
  color: var(--td-text-color-secondary);
}
</style>
