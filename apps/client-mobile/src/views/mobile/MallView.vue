<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckTag, Icon, Image } from 'tdesign-mobile-vue'
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
import { onImageError } from '@/utils/imageFallback'
import { formatZhNumber } from '@/utils/format'

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
      <strong class="tabular-nums">{{ formatZhNumber(auth.points) }}</strong>
      <router-link class="points-rule" to="/mall/rules">积分规则<Icon aria-hidden="true" name="chevron-right" size="12px" /></router-link>
    </section>

    <div class="chips">
      <CheckTag variant="light" size="medium" :checked="category === ''" @change="pickCategory('')">全部</CheckTag>
      <CheckTag
        v-for="c in categories"
        :key="c.code"
        variant="light"
        size="medium"
        :checked="category === c.code"
        @change="pickCategory(c.code)"
      >
        {{ c.label }}
      </CheckTag>
    </div>

    <ListSkeleton v-if="loading && !(data ?? []).length" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock
      v-else-if="(data ?? []).length === 0"
      text="暂无可兑换商品"
      :action-text="category ? '查看全部商品' : undefined"
      @action="pickCategory('')"
    />
    <div v-else class="goods-list stagger">
      <p class="list-count">共 {{ formatZhNumber(data?.length ?? 0) }} 件商品</p>
      <router-link v-for="g in data" :key="g.id" class="goods-card m-card pressable" :to="`/mall/${g.id}`">
        <Image v-if="g.coverUrl" class="goods-cover" :src="g.coverUrl" :alt="g.name" fit="cover" lazy @error="onImageError" />
        <div v-else class="goods-cover goods-cover-fallback"><Icon aria-hidden="true" name="gift" size="28px" /></div>
        <div class="row">
          <h2 class="name">{{ g.name }}</h2>
          <span class="cost">{{ formatZhNumber(g.pointsCost) }} 积分</span>
        </div>
        <p class="desc">{{ g.description }}</p>
        <p class="stock">库存 {{ formatZhNumber(g.stock) }}</p>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.m-mall {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.chips {
  display: flex;
  gap:var(--app-space-4);
  overflow-x: auto;
  padding-bottom:var(--app-space-1);
}

.points-bar {
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap:var(--app-space-4);
  padding:var(--app-space-3) var(--app-space-7);
  border-radius: var(--td-radius-large);
  background: var(--td-brand-color-1);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.points-bar strong {
  color: var(--td-brand-color);
  font-size: var(--app-font-subtitle);
}

.points-rule {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-1);
  min-height: 44px;
  margin-left:var(--app-space-2);
  color: var(--td-brand-color);
  text-decoration: none;
  cursor: pointer;
}

.goods-list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.goods-card {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  overflow: hidden;
}

.goods-cover {
  display: block;
  width: calc(100% + var(--app-space-8) * 2);
  height: 140px;
  margin: calc(var(--app-space-8) * -1) calc(var(--app-space-8) * -1) var(--app-space-6);
}

/* 无封面时收敛为品牌浅底条形占位：不再用与图片等高的空白块挤压列表 */
.goods-cover-fallback {
  display: grid;
  place-items: center;
  height: 96px;
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap:var(--app-space-5);
  margin-bottom:var(--app-space-3);
}

.name {
  margin:0;
  font-size: var(--app-font-body);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cost {
  flex-shrink: 0;
  font-size: var(--app-font-body);
  font-weight: 600;
  color: var(--td-brand-color);
}

.desc {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.stock {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}
</style>
