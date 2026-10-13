<script setup lang="ts">
import { defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid } from '@/utils/form'
import { createGoods, updateGoods } from '@/api/mall'
import { fetchDictEntries } from '@/api/dicts'
import { goodsCategoryMap } from '@/constants/status'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { MallGoods, GoodsCategory } from '@/types'

const RichEditor = defineAsyncComponent(() => import('@/components/RichEditor.vue'))

/* 商品新增/编辑弹窗（统一券码兑换）：新增即下架（status=off，由列表操作上架）；编辑不影响已有兑换订单；
 * 商品仅配置分类/积分/库存/券码有效期/说明，并可自定义可见范围与可下单范围 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  goods: MallGoods | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

/* 只取 GC 前缀的字典码：physical/voucher 为历史值，保留会产生重复选项（与 MallGoodsPanel 口径一致） */
const categoryOptions = ref(
  Object.entries(goodsCategoryMap)
    .filter(([value]) => value.startsWith('GC'))
    .map(([value, label]) => ({ label, value })),
)

/* 分类字典改为首次打开弹窗时按需加载：避免登录页/未打开时携带旧令牌请求（D-101） */
let categoryPromise: Promise<void> | null = null
function ensureCategories(): Promise<void> {
  if (!categoryPromise) {
    categoryPromise = fetchDictEntries('goods_category')
      .then((entries) => {
        const mapped = entries
          .filter((e) => e.status === 'enabled')
          .map((e) => ({ label: e.label, value: e.code }))
        if (mapped.length) categoryOptions.value = mapped
      })
      .catch(() => undefined)
  }
  return categoryPromise
}

const submitting = ref(false)
const formRef = ref()

/* 自定义开关：可见范围/可下单范围（关=不限） */
const customVisibility = ref(false)
const customOrdering = ref(false)
/* 库存基线：编辑时记录弹窗打开时的库内库存，随保存回传；
 * 未调整库存时服务端跳过库存写入，避免表单旧值覆盖期间的下单扣减（并发保护） */
const baseStock = ref<number | null>(null)

const form = reactive({
  name: '',
  coverUrl: '',
  category: 'GC001' as GoodsCategory,
  points: 100,
  stock: 50,
  validDays: 30,
  description: '',
  visibilityIdentities: [] as string[],
  visibilityLevels: [] as string[],
  orderIdentities: [] as string[],
  orderLevels: [] as string[],
})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    void ensureCategories()
    if (props.mode === 'edit' && props.goods) {
      form.name = props.goods.name
      form.coverUrl = props.goods.coverUrl ?? ''
      form.category = props.goods.category
      form.points = props.goods.points
      form.stock = props.goods.stock
      baseStock.value = props.goods.stock
      form.validDays = props.goods.validDays ?? 30
      form.description = props.goods.description
      form.visibilityIdentities = [...(props.goods.visibilityIdentities ?? [])]
      form.visibilityLevels = [...(props.goods.visibilityLevels ?? [])]
      form.orderIdentities = [...(props.goods.orderIdentities ?? [])]
      form.orderLevels = [...(props.goods.orderLevels ?? [])]
      customVisibility.value = form.visibilityIdentities.length > 0 || form.visibilityLevels.length > 0
      customOrdering.value = form.orderIdentities.length > 0 || form.orderLevels.length > 0
    } else {
      form.name = ''
      form.coverUrl = ''
      form.category = 'GC001'
      form.points = 100
      form.stock = 50
      baseStock.value = null
      form.validDays = 30
      form.description = ''
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
  description: [{ required: true, message: '请输入商品说明', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    const payload = {
      name: form.name,
      coverUrl: form.coverUrl.trim() || undefined,
      category: form.category,
      points: form.points,
      stock: form.stock,
      ...(props.mode === 'edit' && baseStock.value !== null ? { baseStock: baseStock.value } : {}),
      validDays: form.validDays,
      description: form.description,
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
    lazy
    destroy-on-close
    :close-on-overlay-click="false"
    :visible="visible"
    :header="mode === 'create' ? '新增商品' : '编辑商品'"
    width="880px"
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
      <t-form-item label="商品封面" name="coverUrl" help="可粘贴素材库文件地址或 HTTPS 图片地址；留空时移动端显示品牌占位图">
        <t-input clearable v-model="form.coverUrl" placeholder="请输入封面图片地址…" />
        <t-image v-if="form.coverUrl" class="cover-preview" :src="form.coverUrl" fit="cover" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="商品分类" name="category">
          <t-select clearable v-model="form.category" :options="categoryOptions" />
        </t-form-item>
        <t-form-item label="兑换积分" name="points">
          <t-input-number v-model="form.points" :min="1" :decimal-places="0" theme="column" class="ctl-w-full" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="库存" name="stock">
          <t-input-number v-model="form.stock" :min="0" :decimal-places="0" theme="column" class="ctl-w-full" />
        </t-form-item>
        <!-- 统一券码兑换：券码有效期（天下单时写入券码到期时间），过期未使用自动退款 -->
        <t-form-item label="有效期（天）" name="validDays" help="兑换后券码有效期，到期未使用将自动退回积分；留空按 30 天处理">
          <t-input-number v-model="form.validDays" :min="1" :max="3650" :decimal-places="0" theme="column" class="ctl-w-full" />
        </t-form-item>
      </div>

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

.cover-preview {
  width: 200px;
  height: 112px;
  margin-top: 8px;
  border-radius: var(--td-radius-medium);
}
</style>
