<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Button, Cell, DialogPlugin, Popup, Toast } from 'tdesign-mobile-vue'
import { createOrder, fetchGoodsDetail, subscribeRestock } from '@/api/mall'
import { listAddresses } from '@/api/addresses'
import { useAsyncList } from '@/composables/useAsyncList'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { AddressItem, Goods } from '@/types'

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
const ordered = ref(false)
const remainingPoints = ref<number | null>(null)
const orderedTip = ref('')

const soldOut = computed(() => (goods.value?.stock ?? 0) <= 0)
const fulfillmentLabel = computed(() =>
  goods.value?.fulfillment === 'voucher' ? '数字券码' : goods.value?.fulfillment === 'service' ? '服务权益' : '实物商品',
)

/* v37 到货提醒 */
const subscribed = ref(false)
async function onSubscribeRestock() {
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  try {
    await subscribeRestock(goodsId)
    subscribed.value = true
    Toast('补货后将第一时间通知你')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '订阅失败，请稍后重试')
  }
}

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
    Toast(`积分不足，还差 ${item.pointsCost - auth.points} 积分`)
    return
  }
  const remaining = auth.points - item.pointsCost
  DialogPlugin.confirm({
    title: '确认兑换',
    content: () =>
      h('div', { style: 'text-align:left' }, [
        h('p', { style: 'margin:0 0 6px' }, `商品：${item.name}`),
        h('p', { style: 'margin:0 0 6px' }, `消耗积分：${item.pointsCost}`),
        item.fulfillment === 'physical' && selectedAddress.value
          ? h('p', { style: 'margin:0 0 6px' }, `收货：${selectedAddress.value.name} ${selectedAddress.value.phone}，${selectedAddress.value.address}`)
          : null,
        h('p', { style: 'margin:0' }, `兑换后剩余：${remaining} 积分`),
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
    ordered.value = true
    remainingPoints.value = res.remainingPoints
    orderedTip.value = item.fulfillment === 'voucher' ? '兑换成功，券码已发放' : item.fulfillment === 'service' ? '兑换成功，待使用' : '兑换成功，待发货'
    auth.points = res.remainingPoints
    Toast(orderedTip.value)
  } catch (e) {
    Toast(e instanceof Error ? e.message : '兑换失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

/* v38：不再自动跳转（避免劫持用户返回操作），改为显式入口 */
function goOrders() {
  void router.push('/me/orders')
}
</script>

<template>
  <div class="m-goods page-fade-in">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="goods">
      <section class="m-card main">
        <h1 class="name">{{ goods.name }}</h1>
        <p class="cost">{{ goods.pointsCost }} <span>积分</span></p>
        <p class="stock">库存 {{ goods.stock }} · {{ fulfillmentLabel }}</p>
        <div class="desc">
          <h3>商品说明</h3>
          <p>{{ goods.description }}</p>
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

      <section class="m-card action">
        <template v-if="ordered">
          <p class="ordered-tip">
            {{ orderedTip }}<span v-if="remainingPoints !== null"> · 剩余积分 {{ remainingPoints }}</span>
          </p>
          <Button theme="primary" variant="outline" block @click="goOrders">查看我的订单 ›</Button>
        </template>
        <template v-else>
          <p v-if="auth.isLogged" class="own-points">当前积分：{{ auth.points }}</p>
          <Button theme="primary" block :disabled="submitting || soldOut" @click="onRedeem">
            {{ soldOut ? '已兑完' : submitting ? '兑换中…' : '立即兑换' }}
          </Button>
          <p v-if="soldOut" class="hint">商品库存不足，可开启到货提醒。</p>
          <Button v-if="soldOut" size="small" variant="outline" :disabled="subscribed" @click="onSubscribeRestock">
            {{ subscribed ? '已开启到货提醒' : '到货提醒' }}
          </Button>
        </template>
      </section>
    </template>

    <Popup v-model:visible="addressPickerVisible" placement="bottom">
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
          <p class="addr-name">{{ item.name }} {{ item.phone }}<span v-if="item.isDefault" class="addr-tag">默认</span></p>
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
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.address-cell {
  padding: 0;
  background: none;
}

.addr-sheet {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.addr-title {
  margin: 0;
  font-size: 15px;
}

.addr-item {
  padding: 10px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  cursor: pointer;
}

.addr-item.active {
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-1);
}

.addr-name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.addr-tag {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
  font-size: 12px;
  font-weight: 400;
}

.addr-detail {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.addr-empty {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
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
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
