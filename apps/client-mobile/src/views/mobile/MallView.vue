<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, CheckTag, Icon, Image, List } from 'tdesign-mobile-vue'
import { fetchGoods } from '@/api/mall'
import CategoryTag from '@/components/shared/CategoryTag.vue'
import { usePagedList } from '@/composables/usePagedList'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useRouteQuerySync } from '@/composables/useRouteQuerySync'
import { useDict } from '@/composables/useDict'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { Goods } from '@/types'
import { onImageError } from '@/utils/imageFallback'
import { formatZhNumber, plainTextSummary } from '@/utils/format'
import { discountedPoints } from '@/utils/points'

useAnimSuppress()

/* 移动积分商城：商品纵列卡片；下架商品由接口过滤，库存 0 仍在列并标记「已售罄」；
 * mallOpen 关闭时 API 抛错 → EmptyBlock 展示。
 * v40：商品分类筛选（字典 goods_category）并同步 URL。 */
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { items: categories, refresh: refreshCategories } = useDict('goods_category')

const category = ref(String(route.query.category ?? ''))
const { items: goodsList, total: goodsTotal, loading, error, moreError, loadingMore, hasMore, refresh, loadMore } = usePagedList<Goods>(
  (page, pageSize) => fetchGoods({ category: category.value || undefined, page, pageSize }),
)
const footerState = computed(() => (loadingMore.value ? 'loading' : hasMore.value ? 'load-more' : ''))

/* 等级折扣：折后价低于原价时列表卡片才展示原价删除线 */
function isDiscounted(goods: Goods): boolean {
  return discountedPoints(goods.pointsCost, auth.pointsDiscount) < goods.pointsCost
}

/* 类别标签：中文名取字典 goods_category；字典未含该 code（已删/停用）时回退展示原值 */
function categoryLabel(goods: Goods): string {
  if (!goods.category) return ''
  return categories.value.find((item) => item.code === goods.category)?.label ?? goods.category
}

/* v45：无封面商品的占位字形——按商品分类区分（权益券 GC003 / 其他），
 * 取代此前 8 件商品共用同一张大块占位的做法；真实封面（coverUrl）仍然优先。 */
function glyphFor(goods: Goods): string {
  return goods.category === 'GC003' ? 'ticket' : 'gift'
}

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
  void refresh()
})

function pickCategory(code: string) {
  category.value = category.value === code ? '' : code
  syncQuery()
  void refresh()
}

onMounted(() => {
  void auth.refreshProfile()
  void refresh()
})

/* v38：返回时刷新商品列表（积分与库存可能变化）；v48：同时强制回源字典，
 * 后台新增商品类型后无需整页刷新即可出现在筛选 chip 中 */
useRefreshOnActivate(() => {
  void refresh()
  void refreshCategories()
  void auth.refreshProfile()
})
</script>

<template>
  <div class="m-mall page-fade-in">
    <section v-if="auth.isLogged" class="points-banner">
      <div class="points-main">
        <p class="points-label">当前积分</p>
        <p class="points-value tabular-nums">{{ formatZhNumber(auth.points) }}</p>
      </div>
      <router-link class="points-rule" to="/mall/rules">
        积分规则<Icon aria-hidden="true" name="chevron-right" size="14px" />
      </router-link>
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

    <ListSkeleton v-if="loading && !goodsList.length" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="refresh" />
    <EmptyBlock
      v-else-if="goodsList.length === 0"
      text="暂无可兑换商品"
      :action-text="category ? '清除筛选' : undefined"
      @action="pickCategory('')"
    />
    <List v-else class="goods-list stagger" :async-loading="footerState" @load-more="loadMore">
      <p class="list-count">共 {{ formatZhNumber(goodsTotal) }} 件商品</p>
      <router-link v-for="g in goodsList" :key="g.id" class="goods-card m-card pressable" :to="`/mall/${g.id}`">
        <Image v-if="g.coverUrl" class="goods-cover content-img" :src="g.coverUrl" :alt="g.name" fit="cover" lazy @error="onImageError" />
        <!-- v45：无封面时不再伪造与图片等高的占位块（8 件商品会长得一模一样、且像加载失败），
             改为按履约类型给出的小字形，卡片更紧凑、一屏可比较更多商品 -->
        <span v-else class="goods-glyph"><Icon aria-hidden="true" :name="glyphFor(g)" size="20px" /></span>
        <div class="row">
          <!-- 类别标签：中文名取字典 goods_category（任意类别都展示，含自定义新增类别） -->
          <CategoryTag v-if="categoryLabel(g)" :label="categoryLabel(g)" />
          <h2 class="name">{{ g.name }}</h2>
          <span class="cost">
            <!-- v49：等级折扣价 = round(原价 × 折扣 ÷ 10)；有折扣时折后价在前、原价删除线在后 -->
            {{ formatZhNumber(discountedPoints(g.pointsCost, auth.pointsDiscount)) }} 积分
            <s v-if="isDiscounted(g)" class="cost-origin tabular-nums">{{ formatZhNumber(g.pointsCost) }} 积分</s>
          </span>
        </div>
        <p class="desc" :class="{ 'voucher-desc': g.category === 'GC003' }">{{ plainTextSummary(g.description) }}</p>
        <p class="stock">
          <!-- v47：售罄（不可兑换）用 StateTag 的 goods 状态集标出；卡片主热区仍可点进详情查看说明 -->
          <template v-if="g.stock > 0">库存 {{ formatZhNumber(g.stock) }}</template>
          <StateTag v-else kind="goods" value="sold_out" />
        </p>
      </router-link>
      <Button v-if="moreError" block variant="outline" @click="loadMore">加载失败，点击重试</Button>
    </List>
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

/* 积分横幅：品牌渐变通栏卡片（复用 --client-brand-gradient，与首页入口卡同源），
 * 左侧「当前积分 + 大数字」为主视觉，右侧「积分规则」文字链；取代此前右上角孤立小胶囊 */
.points-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-5);
  padding: var(--app-space-6) var(--app-space-7);
  border-radius: var(--td-radius-large);
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
}

.points-label {
  margin: 0;
  font: var(--app-type-body-sm);
  opacity: 0.85;
}

.points-value {
  margin: var(--app-space-1) 0 0;
  font: var(--app-type-numeric-lg);
}

.points-rule {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  min-height: 44px;
  padding: 0 var(--app-space-2);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-anti);
  opacity: 0.92;
  text-decoration: none;
  cursor: pointer;
}

/* v45：单列长滚动改为两列网格，一屏可比较 4 件以上商品 */
.goods-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--app-space-5);
}

.goods-list .list-count {
  grid-column: 1 / -1;
}

.goods-card {
  display: flex;
  flex-direction: column;
  padding: var(--app-space-5);
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  overflow: hidden;
}

.goods-cover {
  display: block;
  width: calc(100% + var(--app-space-5) * 2);
  height: 96px;
  margin: calc(var(--app-space-5) * -1) calc(var(--app-space-5) * -1) var(--app-space-5);
}

/* 无封面时的类别字形：小尺寸符号，不再占据整行高度 */
.goods-glyph {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-bottom: var(--app-space-5);
  border-radius: var(--td-radius-large);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

/* 窄卡片内名称与积分改为上下两行，避免同行互相挤压 */
.row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--app-space-2);
  margin-bottom: var(--app-space-3);
}

.name {
  margin:0;
  font: var(--app-type-card-title);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 价格档位高于商品名（card-title）一级，与详情页 numeric-lg 档形成一致的层级递进；
 * 数字等宽避免两列网格里价格跳动 */
.cost {
  flex-shrink: 0;
  font: var(--app-type-numeric);
  font-variant-numeric: tabular-nums;
  color: var(--td-brand-color);
}

/* 等级折扣：原价删除线（折后价为主价格，置于其前） */
.cost-origin {
  margin-left: var(--app-space-2);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-placeholder);
  text-decoration: line-through;
}

.desc {
  margin:0 0 var(--app-space-3);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.voucher-desc {
  -webkit-line-clamp: 3;
}

.stock {
  margin:auto 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}
</style>
