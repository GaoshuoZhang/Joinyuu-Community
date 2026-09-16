<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Tag } from 'tdesign-mobile-vue'
import { fetchGoods } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useRouteQuerySync } from '@/composables/useRouteQuerySync'
import { useDict } from '@/composables/useDict'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { Goods } from '@/types'

useAnimSuppress()

/* 移动积分商城：商品纵列卡片（已过滤下架与零库存）；mallOpen 关闭时 API 抛错 → EmptyBlock 展示。
 * v40：商品分类筛选（字典 goods_category）并同步 URL。 */
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { items: categories } = useDict('goods_category')

const category = ref(String(route.query.category ?? ''))
const { data, loading, error, run } = useAsyncList<Goods[]>(() => fetchGoods({ category: category.value || undefined }))

function syncQuery() {
  const query: Record<string, string> = {}
  if (category.value) query.category = category.value
  const current = route.query as Record<string, string>
  if (current.category === query.category) return
  void router.replace({ query })
}

/* v41：外部跳转带来的分类同步 */
useRouteQuerySync('/mall', (q) => {
  const next = q.category ?? ''
  if (next === category.value) return
  category.value = next
  run()
})

function pickCategory(code: string) {
  category.value = category.value === code ? '' : code
  syncQuery()
  run()
}

onMounted(() => {
  void auth.refreshProfile()
  run()
})

/* v38：返回时刷新商品列表（积分与库存可能变化） */
useRefreshOnActivate(() => {
  run()
  void auth.refreshProfile()
})
</script>

<template>
  <div class="m-mall page-fade-in">
    <section v-if="auth.isLogged" class="points-bar">
      <span>当前积分</span>
      <strong>{{ auth.points }}</strong>
      <a class="points-rule" @click="router.push('/mall/rules')">积分规则 ›</a>
    </section>

    <div class="chips">
      <Tag :theme="category === '' ? 'primary' : 'default'" variant="light" size="medium" @click="pickCategory('')">全部</Tag>
      <Tag
        v-for="c in categories"
        :key="c.code"
        :theme="category === c.code ? 'primary' : 'default'"
        variant="light"
        size="medium"
        @click="pickCategory(c.code)"
      >
        {{ c.label }}
      </Tag>
    </div>

    <ListSkeleton v-if="loading && !(data ?? []).length" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="(data ?? []).length === 0" text="暂无可兑换商品" />
    <div v-else class="goods-list stagger">
      <p class="list-count">共 {{ data?.length }} 件商品</p>
      <article v-for="g in data" :key="g.id" class="goods-card m-card" v-pressable @click="router.push(`/mall/${g.id}`)">
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

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.points-bar {
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: var(--td-radius-large);
  background: var(--td-brand-color-1);
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.points-bar strong {
  color: var(--td-brand-color);
  font-size: 15px;
}

.points-rule {
  min-height: 32px;
  line-height: 32px;
  margin-left: 4px;
  color: var(--td-brand-color);
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
  font-size: 12px;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.stock {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
