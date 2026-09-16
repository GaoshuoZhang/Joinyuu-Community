<script setup lang="ts">
import { defineAsyncComponent, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid } from '@/utils/form'
import { createGoods, updateGoods } from '@/api/mall'
import { fetchDictEntries } from '@/api/dicts'
import { goodsCategoryMap } from '@/constants/status'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { MallGoods, GoodsCategory, GoodsFulfillment } from '@/types'

const RichEditor = defineAsyncComponent(() => import('@/components/RichEditor.vue'))

/* 商品新增/编辑弹窗：新增即下架（status=off，由列表操作上架）；编辑不影响已有兑换订单；
 * 实物商品配置发货方式（自提/邮寄），并可自定义可见范围与可下单范围 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  goods: MallGoods | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const categoryOptions = ref(Object.entries(goodsCategoryMap).map(([value, label]) => ({ label, value })))

onMounted(() => {
  fetchDictEntries('goods_category')
    .then((entries) => {
      const mapped = entries
        .filter((e) => e.status === 'enabled')
        .map((e) => ({ label: e.label, value: e.code }))
      if (mapped.length) categoryOptions.value = mapped
    })
    .catch(() => undefined)
})

const shippingMethodOptions = [
  { label: '自提', value: 'pickup' },
  { label: '邮寄', value: 'delivery' },
]
const fulfillmentOptions = [
  { label: '实物配送', value: 'physical' },
  { label: '券码权益', value: 'voucher' },
  { label: '服务权益', value: 'service' },
]

const submitting = ref(false)
const formRef = ref()

/* 自定义开关：可见范围/可下单范围（关=不限） */
const customVisibility = ref(false)
const customOrdering = ref(false)

const form = reactive({
  name: '',
  category: 'GC001' as GoodsCategory,
  fulfillment: 'physical' as GoodsFulfillment,
  points: 100,
  stock: 50,
  description: '',
  shippingMethods: [] as Array<'pickup' | 'delivery'>,
  pickupAddress: '',
  shippingFee: 0,
  visibilityIdentities: [] as string[],
  visibilityLevels: [] as string[],
  orderIdentities: [] as string[],
  orderLevels: [] as string[],
})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    if (props.mode === 'edit' && props.goods) {
      form.name = props.goods.name
      form.category = props.goods.category
      form.fulfillment = props.goods.fulfillment
      form.points = props.goods.points
      form.stock = props.goods.stock
      form.description = props.goods.description
      form.shippingMethods = [...(props.goods.shippingMethods ?? [])]
      form.pickupAddress = props.goods.pickupAddress ?? ''
      form.shippingFee = props.goods.shippingFee ?? 0
      form.visibilityIdentities = [...(props.goods.visibilityIdentities ?? [])]
      form.visibilityLevels = [...(props.goods.visibilityLevels ?? [])]
      form.orderIdentities = [...(props.goods.orderIdentities ?? [])]
      form.orderLevels = [...(props.goods.orderLevels ?? [])]
      customVisibility.value = form.visibilityIdentities.length > 0 || form.visibilityLevels.length > 0
      customOrdering.value = form.orderIdentities.length > 0 || form.orderLevels.length > 0
    } else {
      form.name = ''
      form.category = 'GC001'
      form.fulfillment = 'physical'
      form.points = 100
      form.stock = 50
      form.description = ''
      form.shippingMethods = []
      form.pickupAddress = ''
      form.shippingFee = 0
      form.visibilityIdentities = []
      form.visibilityLevels = []
      form.orderIdentities = []
      form.orderLevels = []
      customVisibility.value = false
      customOrdering.value = false
    }
    /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 一键同步：可下单范围 ← 可见范围 */
function syncOrdering() {
  form.orderIdentities = [...form.visibilityIdentities]
  form.orderLevels = [...form.visibilityLevels]
}

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入商品名称', trigger: 'submit' }],
  category: [{ required: true, message: '请选择商品类型', trigger: 'submit' }],
  fulfillment: [{ required: true, message: '请选择履约类型', trigger: 'submit' }],
  description: [{ required: true, message: '请输入商品说明', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  const physical = form.fulfillment === 'physical'
  if (physical && form.shippingMethods.includes('pickup') && !form.pickupAddress.trim()) {
    MessagePlugin.warning('请填写自提地址')
    return
  }
  submitting.value = true
  try {
    const payload = {
      name: form.name,
      category: form.category,
      fulfillment: form.fulfillment,
      points: form.points,
      stock: form.stock,
      description: form.description,
      shippingMethods: physical ? form.shippingMethods : [],
      pickupAddress: physical && form.shippingMethods.includes('pickup') ? form.pickupAddress : undefined,
      shippingFee: physical && form.shippingMethods.includes('delivery') ? form.shippingFee : undefined,
      visibilityIdentities: customVisibility.value ? form.visibilityIdentities : [],
      visibilityLevels: customVisibility.value ? form.visibilityLevels : [],
      orderIdentities: customOrdering.value ? form.orderIdentities : [],
      orderLevels: customOrdering.value ? form.orderLevels : [],
    }
    if (props.mode === 'create') {
      await createGoods(payload)
      MessagePlugin.success('商品已新增（默认已下架）')
    } else if (props.goods) {
      await updateGoods(props.goods.id, payload)
      MessagePlugin.success('商品信息已保存')
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :close-on-overlay-click="true"
    :visible="visible"
    :header="mode === 'create' ? '新增商品' : '编辑商品'"
    width="880px"
    lazy
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'create' ? '确认新增' : '保存修改' }}
        </t-button>
      </div>
    </template>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="商品名称" name="name">
        <t-input clearable v-model="form.name" placeholder="请输入商品名称…" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="商品分类" name="category">
          <t-select clearable v-model="form.category" :options="categoryOptions" />
        </t-form-item>
        <t-form-item label="履约类型" name="fulfillment">
          <t-select :clearable="false" v-model="form.fulfillment" :options="fulfillmentOptions" />
        </t-form-item>
        <t-form-item label="兑换积分" name="points">
          <t-input-number v-model="form.points" :min="1" theme="column" style="width: 100%" />
        </t-form-item>
      </div>
      <t-form-item label="库存" name="stock">
        <t-input-number v-model="form.stock" :min="0" theme="column" style="width: 100%" />
      </t-form-item>

      <!-- 实物商品：发货方式（自提/邮寄），按选择显示自提地址或邮费 -->
      <template v-if="form.fulfillment === 'physical'">
        <t-form-item label="发货方式" name="shippingMethods">
          <t-select
            v-model="form.shippingMethods"
            multiple
            clearable
            :options="shippingMethodOptions"
            placeholder="请选择发货方式…"
          />
        </t-form-item>
        <t-form-item
          v-if="form.shippingMethods.includes('pickup')"
          label="自提地址"
          name="pickupAddress"
        >
          <t-input clearable v-model="form.pickupAddress" placeholder="请输入自提地址…" />
        </t-form-item>
        <t-form-item
          v-if="form.shippingMethods.includes('delivery')"
          label="邮费"
          name="shippingFee"
          help="0 = 包邮"
        >
          <t-input-number v-model="form.shippingFee" :min="0" theme="column" style="width: 100%" />
        </t-form-item>
      </template>

      <!-- 自定义范围：关闭 = 不限身份、等级 -->
      <div class="form-row">
        <div class="scope-col">
          <div class="scope-head">
            <span class="scope-title">自定义可见范围</span>
            <t-switch v-model="customVisibility" />
          </div>
          <span class="scope-tip-block">默认关闭 = 所有身份、等级均可见；开启后可限定可见的身份与等级</span>
          <t-form-item v-if="customVisibility" label="身份" name="visibilityIdentities">
            <t-select
              v-model="form.visibilityIdentities"
              multiple
              clearable
              :options="visibilityIdentityOptions"
              placeholder="不限…"
            />
          </t-form-item>
          <t-form-item v-if="customVisibility" label="等级" name="visibilityLevels">
            <t-select v-model="form.visibilityLevels" multiple clearable :options="userLevelOptions" placeholder="不限…" />
          </t-form-item>
        </div>
        <div class="scope-col">
          <div class="scope-head">
            <span class="scope-title">自定义可下单范围</span>
            <div class="scope-right">
              <t-switch v-model="customOrdering" />
              <t-button
                v-if="customOrdering && customVisibility"
                variant="text"
                size="small"
                @click="syncOrdering"
              >
                同步可见范围
              </t-button>
            </div>
          </div>
          <span class="scope-tip-block">默认关闭 = 所有身份、等级均可下单；开启后可限定可下单的身份与等级</span>
          <t-form-item v-if="customOrdering" label="身份" name="orderIdentities">
            <t-select
              v-model="form.orderIdentities"
              multiple
              clearable
              :options="visibilityIdentityOptions"
              placeholder="不限…"
            />
          </t-form-item>
          <t-form-item v-if="customOrdering" label="等级" name="orderLevels">
            <t-select v-model="form.orderLevels" multiple clearable :options="userLevelOptions" placeholder="不限…" />
          </t-form-item>
        </div>
      </div>

      <t-form-item label="商品说明" name="description">
        <RichEditor v-model="form.description" placeholder="兑换说明、领取方式等…" :min-height="320" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.scope-col {
  min-width: 0;
}

@media (max-width: 767px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.scope-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  margin-bottom: 8px;
}

.scope-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-title {
  font-size: 14px;
  font-weight: 400;
  color: var(--td-text-color-primary);
}

.scope-tip-block {
  display: block;
  margin: -6px 0 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
