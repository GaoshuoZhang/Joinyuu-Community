<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, Image, Toast } from 'tdesign-mobile-vue'
import { createOrder, fetchGoodsDetail } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { onImageError } from '@/utils/imageFallback'
import RichTextBlock from '@/components/shared/RichTextBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import FlowResult from '@/components/FlowResult.vue'
import type { Goods } from '@/types'
import { formatZhNumber } from '@/utils/format'
import { discountLabel, discountedPoints } from '@/utils/points'

/* 移动商品详情（统一券码兑换）：信息展示 + 立即兑换（确认弹层含扣减后余额预览）；
 * 未登录跳登录，成功提示剩余积分后进入我的订单。兑换后凭券码到现场由工作人员核销。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const goodsId = route.params.id as string

const { data: goods, loading, error, run } = useAsyncList<Goods>(() => fetchGoodsDetail(goodsId))

onMounted(async () => {
  void auth.refreshProfile()
  await run()
})

const submitting = ref(false)
const orderedId = ref('')
const remainingPoints = ref<number | null>(null)

const soldOut = computed(() => (goods.value?.stock ?? 0) <= 0)
/* 等级折扣价：实扣 = round(商品积分 × 折扣 ÷ 10)（与后端同一算法，实扣以后端为准） */
const chargedPoints = computed(() => discountedPoints(goods.value?.pointsCost ?? 0, auth.pointsDiscount))
const discounted = computed(() => chargedPoints.value < (goods.value?.pointsCost ?? 0))
const validDaysText = computed(() =>
  goods.value?.validDays ? `兑换后 ${goods.value.validDays} 天内有效，过期未使用自动退回积分` : '兑换后 30 天内有效，过期未使用自动退回积分',
)
/* v52：商品说明走后端富编辑器（RichTextBlock 输出 HTML），富文本分支不能开 pre-wrap——
 * 源码缩进/换行会被原样渲染成可见空白；仅纯文本分支保留换行（判定口径与 EventDetailView、
 * RichTextBlock 的富文本识别一致，界面审查 MEDIUM-4）。 */
const descIsPlainText = computed(() => !/<\/?[a-z][^>]*>/i.test(goods.value?.description ?? ''))

function onRedeem() {
  if (!auth.isLogged) {
    void router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  const item = goods.value
  if (!item) return
  if (auth.points < chargedPoints.value) {
    Toast(`积分不足，还差 ${formatZhNumber(chargedPoints.value - auth.points)} 积分`)
    return
  }
  const remaining = auth.points - chargedPoints.value
  DialogPlugin.confirm({
    title: '确认兑换',
    content: () =>
      h('div', { class: 'order-confirm' }, [
        h('p', { class: 'order-confirm__line' }, `商品：${item.name}`),
        ...(discounted.value
          ? [h('p', { class: 'order-confirm__line' }, `价格：${formatZhNumber(item.pointsCost)} 积分 · ${discountLabel(auth.pointsDiscount)}（${formatZhNumber(chargedPoints.value)} 积分）`)]
          : []),
        h('p', { class: 'order-confirm__line' }, `消耗积分：${formatZhNumber(chargedPoints.value)}`),
        h('p', { class: 'order-confirm__line' }, `兑换后剩余：${formatZhNumber(remaining)} 积分`),
      ]),
    cancelBtn: '再想想',
    confirmBtn: '确认兑换',
    onConfirm: () => {
      void submitOrder(item)
    },
  })
}

async function submitOrder(item: Goods) {
  /* 重入守卫：后端下单无幂等键，避免重复点击生成多笔订单 */
  if (submitting.value) return
  submitting.value = true
  try {
    const res = await createOrder({ goodsId: item.id })
    orderedId.value = res.id
    remainingPoints.value = res.remainingPoints
    auth.points = res.remainingPoints
  } catch (e) {
    Toast(e instanceof Error ? e.message : '兑换失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

/* 不再自动跳转（避免劫持用户返回操作），改为显式入口 */
function goOrders() {
  void router.replace(`/me/orders/${orderedId.value}`)
}
</script>

<template>
  <div class="m-goods page-fade-in" :class="{ 'has-fixed-actions': goods && !orderedId, 'sold-out-actions': soldOut }">
    <FlowResult
      v-if="orderedId"
      title="兑换成功"
      :description="`券码已发放，凭券码到现场核销使用。剩余积分 ${formatZhNumber(remainingPoints ?? 0)}。`"
      :reference="orderedId"
      primary-text="查看订单详情"
      secondary-text="返回积分商城"
      @primary="goOrders"
      @secondary="router.replace('/mall')"
    />
    <ListSkeleton v-else-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="goods">
      <section class="m-card main">
        <Image v-if="goods.coverUrl" class="detail-cover content-img" :src="goods.coverUrl" :alt="goods.name" fit="cover" @error="onImageError" />
        <h2 class="name">{{ goods.name }}</h2>
        <p class="cost">
          <span class="tabular-nums">{{ formatZhNumber(chargedPoints) }}</span> <span>积分</span>
          <!-- 等级折扣：展示折后价 + 原价删除线（无折扣时不显示原价） -->
          <s v-if="discounted" class="cost-origin tabular-nums">{{ formatZhNumber(goods.pointsCost) }} 积分</s>
          <span v-if="discounted" class="cost-tag">{{ discountLabel(auth.pointsDiscount) }}</span>
        </p>
        <p class="stock">库存 {{ formatZhNumber(goods.stock) }}</p>
        <p class="valid-days"><Icon aria-hidden="true" name="time" size="14px" />{{ validDaysText }}</p>
        <div class="desc">
          <h3>商品说明</h3>
          <!-- v52：desc-plain 挂在 RichTextBlock 根元素上经继承生效（口径同 EventDetailView）；
               富文本 HTML 分支不挂，避免源码缩进被渲染成可见空白 -->
          <RichTextBlock :class="{ 'desc-plain': descIsPlainText }" :html="goods.description" />
        </div>
      </section>

      <!-- 统一券码兑换说明 -->
      <section class="m-card voucher-notice">
        <p class="voucher-notice__title"><Icon aria-hidden="true" name="qrcode" size="16px" />券码现场兑换</p>
        <p class="voucher-notice__line">兑换成功后生成专属券码，请前往订单详情查看。</p>
        <p class="voucher-notice__line">到店出示券码，由社区工作人员现场核销。</p>
        <p class="voucher-notice__line">核销前可在订单中申请退款，积分原路退回。</p>
      </section>

      <Teleport to="body">
        <section class="mobile-fixed-action-bar goods-actions">
          <p v-if="auth.isLogged" class="own-points">当前积分：<span class="tabular-nums">{{ formatZhNumber(auth.points) }}</span></p>
          <Button theme="primary" block :disabled="submitting || soldOut" @click="onRedeem">
            {{ soldOut ? '已售罄' : submitting ? '兑换中…' : '立即兑换' }}
          </Button>
          <p v-if="soldOut" class="hint">商品暂时缺货，请稍后再来看看。</p>
        </section>
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
.m-goods {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.m-goods.has-fixed-actions {
  padding-bottom: var(--app-action-bar-clearance);
}

/* 售罄态操作栏比常态多一行「暂时缺货」说明（.hint），需要更高净空 */
.m-goods.has-fixed-actions.sold-out-actions {
  padding-bottom: var(--app-action-bar-clearance-lg);
}

.goods-actions {
  align-items: stretch;
  background: var(--td-bg-color-container);
  border-top: 1px solid var(--td-component-border);
  box-shadow: var(--app-action-bar-shadow);
}

.main {
  overflow: hidden;
}

.detail-cover {
  display: block;
  width: calc(100% + var(--app-space-8) * 2);
  height: 190px;
  margin: calc(var(--app-space-8) * -1) calc(var(--app-space-8) * -1) var(--app-space-6);
}

/* 券码有效期提示 */
.valid-days {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin:0 0 var(--app-space-7);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

/* 统一券码兑换说明卡 */
.voucher-notice {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.voucher-notice__title {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin:0;
  font: var(--app-type-card-title);
  color: var(--td-brand-color);
}

.voucher-notice__line {
  margin:0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.name {
  margin:0 0 var(--app-space-6);
  font: var(--app-type-page-title);
}

.cost {
  margin:0 0 var(--app-space-3);
  font: var(--app-type-numeric-lg);
  color: var(--td-brand-color);
}

.cost span {
  font: var(--app-type-body-sm);
}

/* 等级折扣：原价删除线 + 折扣标签（无折扣时不渲染） */
.cost-origin {
  margin-left: var(--app-space-3);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-placeholder);
  text-decoration: line-through;
}

/* v52：折扣标签文字色收敛到 tokens.css 已抬级的标签色档（--td-tag-warning-color = warning-7），
 * 不再直接用 warning 基础档（浅色下 12px 约 2.8:1，界面审查 LOW：配色不另行评估，仅收敛口径） */
.cost-tag {
  margin-left: var(--app-space-3);
  padding: 0 var(--app-space-2);
  border-radius: var(--td-radius-small);
  font: var(--app-type-caption);
  color: var(--td-tag-warning-color);
  background: var(--td-warning-color-1);
}

.stock {
  margin:0 0 var(--app-space-3);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.desc {
  padding-top:var(--app-space-6);
  border-top: 1px solid var(--td-component-border);
}

.desc h3 {
  margin:0 0 var(--app-space-3);
  font: var(--app-type-card-title);
}

/* v52：商品说明的字体/颜色由 RichTextBlock 根（.rich-text）承担并继承；此处只补纯文本分支的
 * 换行保留——.desc-plain 挂在 RichTextBlock 根元素上（子组件根携带父级 scope id），
 * 经继承进入 v-html 内容；富文本 HTML 分支不挂，避免源码缩进被渲染成可见空白。
 * 原 `.desc p { white-space: pre-wrap }` 为后代选择器，编译后不到达 v-html 内容（p 无 scope id），
 * 纯文本换行一直未被保留，一并修正（口径同 EventDetailView，界面审查 MEDIUM-4） */
.desc-plain {
  white-space: pre-wrap;
}

.own-points {
  margin:0;
  text-align: center;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.hint {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}
</style>
