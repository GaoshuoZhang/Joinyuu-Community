<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Cell, DialogPlugin, Image, Popup, Tag, Toast } from 'tdesign-mobile-vue'
import { createOrder, fetchGoodsDetail } from '@/api/mall'
import { listAddresses } from '@/api/addresses'
import { useAsyncList } from '@/composables/useAsyncList'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { onImageError } from '@/utils/imageFallback'
import RichTextBlock from '@/components/shared/RichTextBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import FlowResult from '@/components/FlowResult.vue'
import type { AddressItem, Goods } from '@/types'
import { formatZhNumber } from '@/utils/format'

/* 移动商品详情：信息展示 + 立即兑换（确认弹层含扣减后余额预览）；未登录跳登录，成功提示剩余积分后进入我的订单 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const goodsId = route.params.id as string

const { data: goods, loading, error, run } = useAsyncList<Goods>(() => fetchGoodsDetail(goodsId))

/* v38：实物商品需选择收货地址 */
const addresses = ref<AddressItem[]>([])
const selectedAddressId = ref('')
const addressPickerVisible = ref(false)
const selectedAddress = computed(() => addresses.value.find((item) => item.id === selectedAddressId.value) ?? null)

async function loadAddresses() {
  if (!auth.isLogged || goods.value?.fulfillment !== 'physical') return
  try {
    addresses.value = await listAddresses()
    if (!selectedAddressId.value) {
      selectedAddressId.value = (addresses.value.find((item) => item.isDefault) ?? addresses.value[0])?.id ?? ''
    }
  } catch {
    addresses.value = []
  }
}

onMounted(async () => {
  void auth.refreshProfile()
  await run()
  await loadAddresses()
})

const submitting = ref(false)
const orderedId = ref('')
const remainingPoints = ref<number | null>(null)
const orderedTip = ref('')

const soldOut = computed(() => (goods.value?.stock ?? 0) <= 0)
const fulfillmentLabel = computed(() =>
  goods.value?.fulfillment === 'voucher' ? '权益券' : '实物商品',
)
const validDaysText = computed(() =>
  goods.value?.fulfillment === 'voucher' && goods.value.validDays
    ? `兑换后 ${goods.value.validDays} 天内有效`
    : '',
)

function onRedeem() {
  if (!auth.isLogged) {
    void router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  const item = goods.value
  if (!item) return
  if (item.fulfillment === 'physical' && !selectedAddress.value) {
    Toast('请先添加并选择收货地址')
    void router.push('/me/addresses')
    return
  }
  if (auth.points < item.pointsCost) {
    Toast(`积分不足，还差 ${formatZhNumber(item.pointsCost - auth.points)} 积分`)
    return
  }
  const remaining = auth.points - item.pointsCost
  DialogPlugin.confirm({
    title: '确认兑换',
    content: () =>
      h('div', { class: 'order-confirm' }, [
        h('p', { class: 'order-confirm__line' }, `商品：${item.name}`),
        h('p', { class: 'order-confirm__line' }, `消耗积分：${formatZhNumber(item.pointsCost)}`),
        item.fulfillment === 'physical' && selectedAddress.value
          ? h('p', { class: 'order-confirm__line' }, `收货：${selectedAddress.value.name} ${selectedAddress.value.phone}，${selectedAddress.value.address}`)
          : null,
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
  submitting.value = true
  try {
    const res = await createOrder(item.id, item.fulfillment === 'physical' ? selectedAddressId.value || undefined : undefined)
    orderedId.value = res.id
    remainingPoints.value = res.remainingPoints
    orderedTip.value = item.fulfillment === 'voucher'
      ? '券码已发放，可在订单详情中查看并使用。'
      : '实物商品将在运营发货后更新物流信息。'
    auth.points = res.remainingPoints
  } catch (e) {
    Toast(e instanceof Error ? e.message : '兑换失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

/* v38：不再自动跳转（避免劫持用户返回操作），改为显式入口 */
function goOrders() {
  void router.replace(`/me/orders/${orderedId.value}`)
}
</script>

<template>
  <div class="m-goods page-fade-in" :class="{ 'has-fixed-actions': goods && !orderedId, 'sold-out-actions': soldOut }">
    <FlowResult
      v-if="orderedId"
      title="兑换成功"
      :description="`${orderedTip}剩余积分 ${formatZhNumber(remainingPoints ?? 0)}。`"
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
        <Image v-if="goods.coverUrl" class="detail-cover" :src="goods.coverUrl" :alt="goods.name" fit="cover" @error="onImageError" />
        <h2 class="name">{{ goods.name }}</h2>
        <p class="cost"><span class="tabular-nums">{{ formatZhNumber(goods.pointsCost) }}</span> <span>积分</span></p>
        <p class="stock">库存 {{ formatZhNumber(goods.stock) }} · {{ fulfillmentLabel }}</p>
        <p v-if="validDaysText" class="valid-days">{{ validDaysText }}</p>
        <div class="desc">
          <h3>商品说明</h3>
          <RichTextBlock :html="goods.description" />
        </div>
      </section>

      <section v-if="goods.fulfillment === 'physical'" class="m-card">
        <Cell
          class="address-cell"
          title="收货地址"
          :note="selectedAddress ? `${selectedAddress.name} ${selectedAddress.phone} · ${selectedAddress.address}` : '请选择收货地址'"
          arrow
          :bordered="false"
          @click="addressPickerVisible = true"
        />
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

    <Popup v-model:visible="addressPickerVisible" placement="bottom" :close-btn="true">
      <div class="addr-sheet">
        <h3 class="addr-title">选择收货地址</h3>
        <div
          v-for="item in addresses"
          :key="item.id"
          class="addr-item"
          v-pressable
          :class="{ active: item.id === selectedAddressId }"
          @click="selectedAddressId = item.id; addressPickerVisible = false"
        >
          <p class="addr-name">{{ item.name }} {{ item.phone }}<Tag v-if="item.isDefault" class="addr-tag" size="small" variant="light" theme="primary">默认</Tag></p>
          <p class="addr-detail">{{ item.address }}</p>
        </div>
        <p v-if="!addresses.length" class="addr-empty">暂无收货地址</p>
        <Button variant="outline" block @click="router.push('/me/addresses')">管理收货地址</Button>
      </div>
    </Popup>
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
  padding-bottom: calc(112px + env(safe-area-inset-bottom));
}

.m-goods.has-fixed-actions.sold-out-actions {
  padding-bottom: calc(184px + env(safe-area-inset-bottom));
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

.address-cell {
  padding:0;
  background: none;
}

.addr-sheet {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
  padding: var(--app-space-8) var(--app-space-8) calc(var(--app-space-8) + env(safe-area-inset-bottom));
}

.addr-title {
  margin:0;
  font-size: var(--app-font-subtitle);
}

.addr-item {
  padding:var(--app-space-5);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  cursor: pointer;
}

.addr-item.active {
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-1);
}

.addr-name {
  margin:0;
  font-size: var(--app-font-body);
  font-weight: 600;
}

.addr-tag {
  margin-left:var(--app-space-3);
  vertical-align: middle;
}

.addr-detail {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.addr-empty {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.name {
  margin:0 0 var(--app-space-6);
  font-size: var(--app-font-title);
  line-height: 1.4;
}

.cost {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-title);
  font-weight: 600;
  color: var(--td-brand-color);
}

.cost span {
  font-size: var(--app-font-caption);
  font-weight: 400;
}

.stock {
  margin:0 0 var(--app-space-7);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.desc {
  padding-top:var(--app-space-6);
  border-top: 1px solid var(--td-component-border);
}

.desc h3 {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-body);
}

.desc p {
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

.own-points {
  margin:0;
  text-align: center;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.hint {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}
</style>
tyle>
