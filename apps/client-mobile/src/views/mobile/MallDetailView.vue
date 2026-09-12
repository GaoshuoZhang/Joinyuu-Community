<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Toast } from 'tdesign-mobile-vue'
import { createOrder, fetchGoodsDetail } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { Goods } from '@/types'

/* 移动商品详情：信息展示 + 立即兑换；未登录跳登录，成功提示剩余积分后进入我的订单 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const goodsId = route.params.id as string

const { data: goods, loading, error, run } = useAsyncList<Goods>(() => fetchGoodsDetail(goodsId))
onMounted(run)

const submitting = ref(false)
const ordered = ref(false)
const remainingPoints = ref<number | null>(null)

const soldOut = computed(() => (goods.value?.stock ?? 0) <= 0)

async function onRedeem() {
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  submitting.value = true
  try {
    const res = await createOrder(goodsId)
    ordered.value = true
    remainingPoints.value = res.remainingPoints
    auth.points = res.remainingPoints
    Toast('兑换成功，待发货')
    setTimeout(() => {
      router.push('/me/orders')
    }, 1200)
  } catch (e) {
    Toast(e instanceof Error ? e.message : '兑换失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="m-goods page-fade-in">
    <a class="back" @click="router.push('/mall')">‹ 返回</a>

    <div v-if="loading" class="skeleton">加载中…</div>
    <EmptyBlock v-else-if="error" :text="error" />
    <template v-else-if="goods">
      <section class="m-card main">
        <h1 class="name">{{ goods.name }}</h1>
        <p class="cost">{{ goods.pointsCost }} <span>积分</span></p>
        <p class="stock">库存 {{ goods.stock }}</p>
        <div class="desc">
          <h3>商品说明</h3>
          <p>{{ goods.description }}</p>
        </div>
      </section>

      <section class="m-card action">
        <template v-if="ordered">
          <p class="ordered-tip">
            兑换成功，待发货<span v-if="remainingPoints !== null"> · 剩余积分 {{ remainingPoints }}</span>
          </p>
        </template>
        <template v-else>
          <p v-if="auth.isLogged" class="own-points">当前积分：{{ auth.points }}</p>
          <Button theme="primary" block :disabled="submitting || soldOut" @click="onRedeem">
            {{ soldOut ? '已兑完' : submitting ? '兑换中…' : '立即兑换' }}
          </Button>
          <p v-if="soldOut" class="hint">商品库存不足，请关注补货。</p>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-goods {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.back {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  cursor: pointer;
  width: fit-content;
}

.skeleton {
  padding: 20px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
}

.name {
  margin: 0 0 12px;
  font-size: 18px;
  line-height: 1.4;
}

.cost {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  color: var(--td-brand-color);
}

.cost span {
  font-size: 12px;
  font-weight: 400;
}

.stock {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.desc {
  padding-top: 12px;
  border-top: 1px solid var(--td-component-border);
}

.desc h3 {
  margin: 0 0 6px;
  font-size: 13px;
}

.desc p {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

.action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.own-points {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.ordered-tip {
  margin: 0;
  font-size: 14px;
  color: var(--td-success-color);
  font-weight: 600;
}

.hint {
  margin: 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
</style>
