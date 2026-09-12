<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Loading } from 'tdesign-mobile-vue'
import { fetchMyOrders } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyOrder } from '@/types'

/* 移动我的兑换订单：订单卡片（商品/积分/状态/时间）；空态提供去兑换入口 */
const router = useRouter()

const { data, loading, error, run } = useAsyncList<MyOrder[]>(() => fetchMyOrders())
onMounted(run)
</script>

<template>
  <div class="m-orders page-fade-in stagger">
    <Loading v-if="loading" class="state" text="加载中…" />
    <section v-else-if="error" class="error-box">
      <p>{{ error }}</p>
      <Button variant="outline" size="small" @click="run">重试</Button>
    </section>
    <template v-else-if="(data ?? []).length > 0">
      <div v-for="o in data" :key="o.id" class="m-card">
        <div class="row">
          <p class="name">{{ o.goodsName }}</p>
          <StateTag kind="order" :value="o.status" />
        </div>
        <p class="cost">{{ o.pointsCost }} 积分</p>
        <p class="meta">
          下单时间：{{ o.createdAt }}<template v-if="o.shippedAt"> · 发货时间：{{ o.shippedAt }}</template>
        </p>
      </div>
    </template>
    <template v-else>
      <EmptyBlock text="暂无兑换订单" />
      <Button theme="primary" class="go-mall" @click="router.push('/mall')">去兑换 ›</Button>
    </template>
  </div>
</template>

<style scoped>
.m-orders {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.error-box {
  text-align: center;
  color: var(--td-error-color);
  font-size: 12px;
}

.error-box p {
  margin: 0 0 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cost {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-brand-color);
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.go-mall {
  align-self: center;
}
</style>
