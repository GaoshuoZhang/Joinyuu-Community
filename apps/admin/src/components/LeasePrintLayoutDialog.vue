<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { LEASE_PRINT_FIELDS } from '@/constants/leasePrintLayout'
import { fetchLeasePrintLayout, updateLeasePrintLayout } from '@/api/workstations'

/**
 * 租约「打印版式」配置（全局单例，存服务端）：
 * 打印单标题（纯文本）/「租赁信息」栏目勾选启用 /「条款说明」纯文本（支持换行，留空回落内置三条）。
 * 打开时读取当前配置，保存为局部更新（未改动项保持原值）。
 */
const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const loading = ref(false)
const saving = ref(false)
const title = ref('')
const clausesText = ref('')
/* 栏目可见性：布尔 v-model 直接绑定；键集来自 LEASE_PRINT_FIELDS（与后端 LEASE_PRINT_FIELD_KEYS 一致） */
const enabled = reactive<Record<string, boolean>>(
  Object.fromEntries(LEASE_PRINT_FIELDS.map((field) => [field.key, true])),
)

function onClose() {
  if (saving.value) return
  emit('update:visible', false)
}

watch(
  () => props.visible,
  async (open) => {
    if (!open) return
    loading.value = true
    try {
      const layout = await fetchLeasePrintLayout()
      title.value = layout.title
      clausesText.value = layout.clausesText
      for (const field of LEASE_PRINT_FIELDS) enabled[field.key] = layout.fields?.[field.key] !== false
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '打印版式加载失败')
      emit('update:visible', false)
    } finally {
      loading.value = false
    }
  },
)

async function onSave() {
  saving.value = true
  try {
    await updateLeasePrintLayout({ title: title.value, fields: { ...enabled }, clausesText: clausesText.value })
    MessagePlugin.success('打印版式已保存')
    emit('update:visible', false)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <t-dialog
    :visible="visible"
    header="打印版式"
    width="560px"
    :close-on-overlay-click="false"
    @close="onClose"
  >
    <t-loading :loading="loading" size="small">
      <t-form label-align="top">
        <t-form-item label="打印单标题" help="显示在打印单顶部；留空则使用默认标题">
          <t-input v-accessible-field v-model="title" :maxlength="64" placeholder="聚屿社区 · 办公位租约确认单…" />
        </t-form-item>

        <t-form-item label="「租赁信息」栏目" help="取消勾选的栏目不会出现在打印单上">
          <div class="field-grid">
            <t-checkbox v-for="field in LEASE_PRINT_FIELDS" :key="field.key" v-model="enabled[field.key]">
              {{ field.label }}
            </t-checkbox>
          </div>
        </t-form-item>

        <t-form-item label="条款说明" help="一行一条，支持换行；留空则使用内置三条条款">
          <t-textarea
            v-accessible-field
            v-model="clausesText"
            :maxlength="2000"
            :autosize="{ minRows: 4, maxRows: 10 }"
            placeholder="一行一条条款说明…"
          />
        </t-form-item>
      </t-form>
    </t-loading>

    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" :disabled="saving" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="saving" :disabled="loading" @click="onSave">保存</t-button>
      </div>
    </template>
  </t-dialog>
</template>

<style scoped>
.field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 16px;
}
</style>
