<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import {
  Button,
  DialogPlugin,
  Form,
  FormItem,
  Input,
  Popup,
  SwipeCell,
  Switch,
  Tag,
  Toast,
} from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { listAddresses, removeAddress, saveAddress, setDefaultAddress } from '@/api/addresses'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { AddressItem } from '@/types'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { isPhone } from '@/utils/validators'

/* 收货地址：实物兑换所需；支持新增/编辑/删除/默认地址。
 * v46：编辑表单迁移 t-form/rules（错误内联 + 提交滚动定位）；
 * 列表项左滑展示「编辑/删除」（t-swipe-cell），保留「设为默认」为卡片主操作。 */
const loading = ref(true)
const error = ref('')
const items = ref<AddressItem[]>([])

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await listAddresses()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const editorOpen = ref(false)
const editingId = ref('')
const form = reactive({ name: '', phone: '', address: '', isDefault: false })
const editorBaseline = ref('')
const editorSnapshot = computed(() => JSON.stringify(form))
const editorDirty = computed(() => editorOpen.value && editorSnapshot.value !== editorBaseline.value)
useUnsavedGuard(() => editorDirty.value)
const editorFormRef = ref<FormInstanceFunctions>()
const saving = ref(false)

const editorRules: FormRules<typeof form> = {
  name: [{ required: true, message: '请输入收货人姓名' }],
  phone: [
    { required: true, message: '请输入 11 位手机号' },
    { validator: (val: string) => !val.trim() || isPhone(val), message: '请输入 11 位手机号' },
  ],
  address: [
    { required: true, message: '请输入详细收货地址' },
    { validator: (val: string) => !val.trim() || val.trim().length >= 5, message: '地址不完整，请补充省市区与门牌号' },
  ],
}

function openEditor(item?: AddressItem) {
  editingId.value = item?.id ?? ''
  form.name = item?.name ?? ''
  form.phone = item?.phone ?? ''
  form.address = item?.address ?? ''
  form.isDefault = item?.isDefault ?? items.value.length === 0
  editorBaseline.value = editorSnapshot.value
  editorOpen.value = true
  /* 重新打开时清空上一轮的校验状态，避免残留错误提示 */
  void nextTick(() => editorFormRef.value?.clearValidate())
}

function setEditorVisible(visible: boolean) {
  if (visible || !editorDirty.value) {
    editorOpen.value = visible
    return
  }
  DialogPlugin.confirm({
    title: '放弃地址修改？',
    content: '当前地址尚未保存，关闭后需要重新填写。',
    cancelBtn: '继续编辑',
    confirmBtn: '放弃修改',
    onConfirm: () => {
      editorOpen.value = false
    },
  })
}

async function onSave() {
  saving.value = true
  try {
    await saveAddress(editingId.value || undefined, {
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      isDefault: form.isDefault,
    })
    Toast('地址已保存')
    editorBaseline.value = editorSnapshot.value
    editorOpen.value = false
    await load()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function onEditorSubmit({ validateResult }: { validateResult: unknown }) {
  if (validateResult === true) void onSave()
}

const defaultingId = ref('')

async function onSetDefault(item: AddressItem) {
  if (item.isDefault || defaultingId.value) return
  defaultingId.value = item.id
  try {
    await setDefaultAddress(item.id)
    Toast('已设为默认地址')
    await load()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '设置失败，请稍后重试')
  } finally {
    defaultingId.value = ''
  }
}

function onRemove(item: AddressItem) {
  DialogPlugin.confirm({
    title: '删除地址',
    content: `确认删除「${item.name} · ${item.address}」？`,
    cancelBtn: '取消',
    confirmBtn: '确认删除',
    onConfirm: async () => {
      try {
        await removeAddress(item.id)
        Toast('地址已删除')
        await load()
      } catch (e) {
        Toast(e instanceof ApiError ? e.message : '删除失败，请稍后重试')
      }
    },
  })
}
</script>

<template>
  <div class="page-fade-in m-addresses">
    <header class="head">
      <p class="page-desc">实物兑换将寄送到默认地址</p>
    </header>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="load" />
    <!-- v45：空状态补出口，避免二级页没有 TabBar 时成为死胡同 -->
    <EmptyBlock v-else-if="!items.length" text="暂无收货地址，添加后可用于实物兑换" action-text="新增地址" @action="openEditor()" />

    <div v-else class="stagger list">
      <SwipeCell v-for="item in items" :key="item.id">
        <article class="m-card addr">
          <div class="row">
            <strong class="name">{{ item.name }}</strong>
            <span class="phone">{{ item.phone }}</span>
            <Tag v-if="item.isDefault" class="default-tag" size="small" variant="light" theme="primary">默认</Tag>
          </div>
          <p class="detail">{{ item.address }}</p>
          <div v-if="!item.isDefault" class="ops">
            <Button
              size="small"
              variant="outline"
              :loading="defaultingId === item.id"
              @click="onSetDefault(item)"
            >
              设为默认
            </Button>
          </div>
        </article>
        <template #right>
          <div class="swipe-btn swipe-btn--edit" role="button" aria-label="编辑地址" @click="openEditor(item)">编辑</div>
          <div class="swipe-btn swipe-btn--del" role="button" aria-label="删除地址" @click="onRemove(item)">删除</div>
        </template>
      </SwipeCell>
    </div>

    <Button theme="primary" block class="add-btn" @click="openEditor()">新增收货地址</Button>

    <Popup :visible="editorOpen" placement="bottom" :close-btn="true" @update:visible="setEditorVisible">
      <div class="editor">
        <h2 class="editor-title">{{ editingId ? '编辑地址' : '新增地址' }}</h2>
        <Form
          ref="editorFormRef"
          class="editor-form"
          :data="form"
          :rules="editorRules"
          label-align="top"
          scroll-to-first-error="smooth"
          @submit="onEditorSubmit"
        >
          <FormItem label="收货人" name="name">
            <Input v-model="form.name" autocomplete="off" :maxlength="20" placeholder="请输入收货人姓名…" clearable />
          </FormItem>
          <FormItem label="联系电话" name="phone">
            <Input v-model="form.phone" type="tel" autocomplete="tel" :maxlength="11" placeholder="请输入 11 位手机号…" clearable />
          </FormItem>
          <FormItem label="详细地址" name="address">
            <Input v-model="form.address" autocomplete="street-address" :maxlength="80" placeholder="省市区 + 详细门牌…" clearable />
          </FormItem>
          <div class="editor-foot">
            <div class="switch-row">
              <span>设为默认地址</span>
              <Switch v-model="form.isDefault" />
            </div>
            <Button theme="primary" size="large" block type="submit" :loading="saving">保存</Button>
          </div>
        </Form>
      </div>
    </Popup>
  </div>
</template>

<style scoped>
.m-addresses {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.head .page-desc {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}


.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

/* 长姓名 + 11 位手机号 + 「默认」标签同行必然溢出：允许换行，姓名超出时省略 */
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap:var(--app-space-4);
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 标签不参与压缩，保证「默认」始终完整可见 */
.default-tag {
  flex: none;
}

.phone {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.detail {
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-body);
  line-height: 1.7;
  color: var(--td-text-color-primary);
}

.ops {
  display: flex;
  justify-content: flex-end;
  gap:var(--app-space-4);
  margin-top:var(--app-space-5);
}

.add-btn {
  margin-top:var(--app-space-2);
}

/* 左滑操作按钮（官方示例形态：固定宽度、整高、居中文字） */
.swipe-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 100%;
  min-height: 88px;
  color: var(--td-text-color-anti);
  font-size: var(--app-font-body);
}

.swipe-btn--edit {
  background: var(--td-brand-color);
}

.swipe-btn--del {
  background: var(--td-error-color);
}

.editor {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
  /* 左右内距交给 t-form-item 自带的内距，避免与其叠加出现双重留白 */
  padding: var(--app-space-8) 0 calc(var(--app-space-8) + env(safe-area-inset-bottom));
}

.editor-title {
  margin:0;
  padding: 0 var(--app-space-8);
  font-size: var(--app-font-subtitle);
}

/* 表单版式用官方能力：label-align="top"（标签在上）+ 官方标签字号变量；
 * 不再用 :deep() 改写 t-form 内部类，标签保持可见。 */
.editor-form {
  --td-form-label-font-size: var(--app-font-caption);
}

/* 提交区在表单内，与表单字段同宽（字段内距由 t-form-item 提供） */
.editor-foot {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
  padding: 0 var(--app-space-8);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--app-font-body);
}
</style>
