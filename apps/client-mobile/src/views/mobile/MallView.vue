<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'
import { fetchGoods } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { Goods } from '@/types'

/* 移动积分商城：商品纵列卡片（已过滤下架与零库存）；mallOpen 关闭时 API 抛错 → EmptyBlock 展示 */
const router = useRouter()
const auth = useAuthStore()

const { data, loading, error, run } = useAsyncList<Goods[]>(() => fetchGoods())
onMounted(run)
</script>

<template>
  <div class="m-mall page-fade-in">
    <section v-if="auth.isLogged" class="points-bar">
      <span>当前积分</span>
      <strong>{{ auth.points }}</strong>
    </section>

    <div v-if="loading" class="skeleton">加载中…</div>
    <template v-else-if="error">
      <EmptyBlock :text="error" />
      <Button variant="outline" size="small" class="retry" @click="run">重试</Button>
    </template>
    <EmptyBlock v-else-if="(data ?? []).length === 0" text="暂无可兑换商品" />
    <div v-else class="goods-list stagger">
      <article v-for="g in data" :key="g.id" class="goods-card m-card" @click="router.push(`/mall/${g.id}`)">
        <div class="row">
          <h3 class="name">{{ g.name }}</h3>
          <span class="cost">{{ g.pointsCost }} 积分</span>
        </div>
        <p class="desc">{{ g.description }}</p>
        <p class="stock">库存 {{ g.stock }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.m-mall {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.points-bar {
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: var(--td-radius-medium);
  background: var(--td-brand-color-1);
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.points-bar strong {
  color: var(--td-brand-color);
  font-size: 15px;
}

.skeleton {
  padding: 20px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
}

.retry {
  align-self: center;
}

.goods-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.goods-card {
  cursor: pointer;
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.name {
  margin: 0;
  font-size: 14px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cost {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--td-brand-color);
}

.desc {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.stock {
  margin: 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
</style>
