<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { createGoods, updateGoods } from '@/api/mall'
import { goodsCategoryMap } from '@/constants/status'
import type { MallGoods, GoodsCategory } from '@/types'

/* 商品创建/编辑弹窗：创建即上架（status=on，累计兑换次数从 0 起）；编辑不影响已有兑换订单 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  goods: MallGoods | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const categoryOptions = Object.entries(goodsCategoryMap).map(([value, label]) => ({ label, value }))

const submitting = ref(false)
const formRef = ref()

const form = reactive({
  name: '',
  category: 'physical' as GoodsCategory,
  points: 100,
  stock: 50,
  description: '',
})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    if (props.mode === 'edit' && props.goods) {
      form.name = props.goods.name
      form.category = props.goods.category
      form.points = props.goods.points
      form.stock = props.goods.stock
      form.description = props.goods.description
    } else {
      form.name = ''
      form.category = 'physical'
      form.points = 100
      form.stock = 50
      form.description = ''
    }
    /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入商品名称', trigger: 'submit' }],
  category: [{ required: true, message: '请选择商品类型', trigger: 'submit' }],
  description: [{ required: true, message: '请输入商品说明', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    const payload = {
      name: form.name,
      category: form.category,
      points: form.points,
      stock: form.stock,
      description: form.description,
    }
    if (props.mode === 'create') {
      const item = await createGoods(payload)
      MessagePlugin.success(`商品已创建并上架（${item.id}）`)
    } else if (props.goods) {
      await updateGoods(props.goods.id, payload)
      MessagePlugin.success('商品修改已保存')
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
    :visible="visible"
    :header="mode === 'create' ? '上架商品' : '编辑商品'"
    width="560px"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'create' ? '确认上架' : '保存修改' }}
        </t-button>
      </div>
    </template>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="商品名称" name="name">
        <t-input clearable v-model="form.name" placeholder="请输入商品名称" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="商品类型" name="category">
          <t-select clearable v-model="form.category" :options="categoryOptions" />
        </t-form-item>
        <t-form-item label="兑换积分" name="points">
          <t-input-number v-model="form.points" :min="1" theme="column" style="width: 100%" />
        </t-form-item>
      </div>
      <t-form-item label="库存" name="stock">
        <t-input-number v-model="form.stock" :min="0" theme="column" style="width: 100%" />
      </t-form-item>
      <t-form-item label="商品说明" name="description">
        <t-textarea
          v-model="form.description"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="兑换说明、领取方式等"
        />
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

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
