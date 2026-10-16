<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { fetchLogRetention, updateLogRetention } from '@/api/auditLogs'
import { useDialogFormProtection } from '@/utils/form'

/* 日志设置（「日志与审计」页右上角）：操作日志 / 登录日志保留期（天），0 = 永久保存。
 * 未保存保护与保存流程对齐归档设置（useDialogFormProtection + 打开时读取 + 成功后关闭）。 */
const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'saved'): void
}>()

const visible = computed(() => props.visible)
const loading = ref(false)
const saving = ref(false)
const form = reactive({ auditLogRetentionDays: 180, loginLogRetentionDays: 180 })

const { close, markBaseline } = useDialogFormProtection(
  () => ({ ...form }),
  visible,
  computed(() => loading.value || saving.value),
)

async function load() {
  loading.value = true
  try {
    const data = await fetchLogRetention()
    form.auditLogRetentionDays = data.auditLogRetentionDays
    form.loginLogRetentionDays = data.loginLogRetentionDays
    markBaseline()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '日志设置加载失败')
    emit('update:visible', false)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.visible,
  (open) => {
    if (open) void load()
  },
)

/** 保留期合法值：0-3650 的整数（0 = 永久保存）；留空/非法不允许提交，避免静默变成「永久」 */
function normalized(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= 3650 ? value : null
}

async function onConfirm() {
  const auditLogRetentionDays = normalized(form.auditLogRetentionDays)
  const loginLogRetentionDays = normalized(form.loginLogRetentionDays)
  if (auditLogRetentionDays === null || loginLogRetentionDays === null) {
    MessagePlugin.error('保留期须为 0-3650 的整数，0 表示永久保存')
    return
  }
  saving.value = true
  try {
    const next = await updateLogRetention({ auditLogRetentionDays, loginLogRetentionDays })
    form.auditLogRetentionDays = next.auditLogRetentionDays
    form.loginLogRetentionDays = next.loginLogRetentionDays
    emit('saved')
    MessagePlugin.success('日志设置已保存')
    emit('update:visible', false)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <t-dialog :visible="visible" header="日志设置" width="520px" @close="close">
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="close">取消</t-button>
        <t-button theme="primary" :loading="saving" :disabled="loading" @click="onConfirm">保存</t-button>
      </div>
    </template>
    <t-loading :loading="loading" size="small">
      <t-form :data="form" label-align="top">
        <t-form-item label="操作日志保留期（天）" help="0 = 永久保存；超期日志由每日定时任务自动清理">
          <t-input-number v-accessible-field class="ctl-w-lg" v-model="form.auditLogRetentionDays" :min="0" :max="3650" :step="1" theme="column" />
        </t-form-item>
        <t-form-item label="登录日志保留期（天）" help="0 = 永久保存；超期日志由每日定时任务自动清理">
          <t-input-number v-accessible-field class="ctl-w-lg" v-model="form.loginLogRetentionDays" :min="0" :max="3650" :step="1" theme="column" />
        </t-form-item>
      </t-form>
    </t-loading>
  </t-dialog>
</template>
