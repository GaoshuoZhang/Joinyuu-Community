<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Loading, Toast } from 'tdesign-mobile-vue'
import { confirmOrder, fetchMyOrders } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyOrder } from '@/types'

/* 移动我的兑换订单：订单卡片（商品/积分/状态/时间）；shipped 可确认收货（Dialog 二次确认）；空态提供去兑换入口 */
const router = useRouter()

const { data, loading, error, run } = useAsyncList<MyOrder[]>(() => fetchMyOrders())
onMounted(run)

const actingId = ref('')

function onConfirmReceipt(o: MyOrder) {
  DialogPlugin.confirm({
    title: '确认收货',
    content: `确认已收到「${o.goodsName}」？确认后订单将完成。`,
    cancelBtn: '取消',
    confirmBtn: '确认收货',
    onConfirm: () => {
      void doConfirm(o)
    },
  })
}

async function doConfirm(o: MyOrder) {
  actingId.value = o.id
  try {
    await confirmOrder(o.id)
    Toast('已确认收货')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  } finally {
    actingId.value = ''
  }
}
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
          下单时间：{{ o.createdAt }}<template v-if="o.shippedAt"> · 发货时间：{{ o.shippedAt }}</template><template v-if="o.finishedAt"> · 完成时间：{{ o.finishedAt }}</template>
        </p>
        <div v-if="o.status === 'shipped'" class="ops">
          <Button theme="primary" size="small" :disabled="actingId === o.id" @click="onConfirmReceipt(o)">
            {{ actingId === o.id ? '处理中…' : '确认收货' }}
          </Button>
        </div>
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

.ops {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.go-mall {
  align-self: center;
}
</style>
