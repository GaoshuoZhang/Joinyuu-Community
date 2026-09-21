<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Button, DialogPlugin, Input, Popup, Switch, Tag, Toast } from 'tdesign-mobile-vue'
import { listAddresses, removeAddress, saveAddress, setDefaultAddress } from '@/api/addresses'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { AddressItem } from '@/types'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'

/* 收货地址：实物兑换所需；支持新增/编辑/删除/默认地址。 */
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
/* v40：行内校验错误 */
const errors = reactive({ name: '', phone: '', address: '' })
watch(() => form.name, () => (errors.name = ''))
watch(() => form.phone, () => (errors.phone = ''))
watch(() => form.address, () => (errors.address = ''))
const saving = ref(false)

function openEditor(item?: AddressItem) {
  editingId.value = item?.id ?? ''
  form.name = item?.name ?? ''
  form.phone = item?.phone ?? ''
  form.address = item?.address ?? ''
  form.isDefault = item?.isDefault ?? items.value.length === 0
  editorBaseline.value = editorSnapshot.value
  editorOpen.value = true
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
  errors.name = ''
  errors.phone = ''
  errors.address = ''
  if (!form.name.trim()) {
    errors.name = '请输入收货人姓名'
    return void Toast(errors.name)
  }
  if (!/^1\d{10}$/.test(form.phone.trim())) {
    errors.phone = '请输入 11 位手机号'
    return void Toast(errors.phone)
  }
  if (form.address.trim().length < 5) {
    errors.address = '请输入详细收货地址'
    return void Toast(errors.address)
  }
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

    <div v-else class="list">
      <article v-for="item in items" :key="item.id" class="m-card addr">
        <div class="row">
          <strong>{{ item.name }}</strong>
          <span class="phone">{{ item.phone }}</span>
          <Tag v-if="item.isDefault" size="small" variant="light" theme="primary">默认</Tag>
        </div>
        <p class="detail">{{ item.address }}</p>
        <div class="ops">
          <Button
            v-if="!item.isDefault"
            size="small"
            variant="outline"
            :loading="defaultingId === item.id"
            @click="onSetDefault(item)"
          >
            设为默认
          </Button>
          <Button size="small" variant="outline" @click="openEditor(item)">编辑</Button>
          <Button size="small" variant="outline" theme="danger" @click="onRemove(item)">删除</Button>
        </div>
      </article>
    </div>

    <Button theme="primary" block class="add-btn" @click="openEditor()">新增收货地址</Button>

    <Popup :visible="editorOpen" placement="bottom" :close-btn="true" @update:visible="setEditorVisible">
      <div class="editor">
        <h2 class="editor-title">{{ editingId ? '编辑地址' : '新增地址' }}</h2>
        <div class="field">
          <label>收货人</label>
          <Input v-model="form.name" autocomplete="off" :maxlength="20" placeholder="请输入收货人姓名…" clearable /><p v-if="errors.name" class="field-error">{{ errors.name }}</p>
        </div>
        <div class="field">
          <label>联系电话</label>
          <Input v-model="form.phone" type="tel" autocomplete="tel" :maxlength="11" placeholder="请输入 11 位手机号…" clearable /><p v-if="errors.phone" class="field-error">{{ errors.phone }}</p>
        </div>
        <div class="field">
          <label>详细地址</label>
          <Input v-model="form.address" autocomplete="street-address" :maxlength="80" placeholder="省市区 + 详细门牌…" clearable /><p v-if="errors.address" class="field-error">{{ errors.address }}</p>
        </div>
        <div class="switch-row">
          <span>设为默认地址</span>
          <Switch v-model="form.isDefault" />
        </div>
        <Button theme="primary" size="large" block :loading="saving" @click="onSave">保存</Button>
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

.row {
  display: flex;
  align-items: center;
  gap:var(--app-space-4);
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

.editor {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
  padding: var(--app-space-8) var(--app-space-8) calc(var(--app-space-8) + env(safe-area-inset-bottom));
}

.editor-title {
  margin:0;
  font-size: var(--app-font-subtitle);
}

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--app-font-body);
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}
</style>
