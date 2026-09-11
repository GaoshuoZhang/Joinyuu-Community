<script setup lang="ts">
import { ref, watch } from 'vue'

/* 一键归档二次确认对话框：复选框列出当前页可归档状态（默认全选），确认后回传所选状态值 */
const props = defineProps<{
  visible: boolean
  title: string
  statuses: { label: string; value: string }[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', values: string[]): void
}>()

const checked = ref<string[]>([])

watch(
  () => props.visible,
  (v) => {
    if (v) checked.value = props.statuses.map((s) => s.value)
  },
)

function onClose() {
  if (props.loading) return
  emit('update:visible', false)
}

function onConfirm() {
  if (!checked.value.length || props.loading) return
  emit('confirm', [...checked.value])
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="title"
    width="480px"
    @close="onClose"
  >
    <p class="archive-tip">选择需要归档的状态（默认全选）：</p>
    <t-checkbox-group v-model="checked" :disabled="loading">
      <t-checkbox v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</t-checkbox>
    </t-checkbox-group>
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" :disabled="loading" @click="onClose">取消</t-button>
        <t-button
          theme="warning"
          :disabled="checked.length === 0"
          :loading="loading"
          @click="onConfirm"
        >
          确认归档
        </t-button>
      </div>
    </template>
  </t-dialog>
</template>

<style scoped>
.archive-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
