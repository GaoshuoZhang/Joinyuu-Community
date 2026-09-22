<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * 一键归档二次确认对话框：
 * - 确认前展示「预计影响 N 条」（由 countForStatus 按所选状态逐个取数求和）；
 * - 执行中（progress 非空）切换为进度条 + 可取消（emit 'cancel'）。
 * 复选框列出当前页可归档状态（默认全选），确认后回传所选状态值。
 */
const props = defineProps<{
  visible: boolean
  title: string
  statuses: { label: string; value: string }[]
  loading?: boolean
  /** 按状态查询预计归档条数（page=1&pageSize=1 读 total） */
  countForStatus?: (status: string) => Promise<number>
  /** 执行进度：非空表示正在执行，展示进度并允许取消 */
  progress?: { done: number; total: number; failed: number } | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', values: string[]): void
  (e: 'cancel'): void
}>()

const checked = ref<string[]>([])
const estimated = ref<number | null>(null)
const estimating = ref(false)
const estimateFailed = ref(false)

const running = computed(() => props.progress != null)
const percent = computed(() => {
  const p = props.progress
  if (!p || p.total === 0) return 0
  return Math.round((p.done / p.total) * 100)
})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    estimated.value = null
    estimateFailed.value = false
    checked.value = props.statuses.map((s) => s.value)
  },
)

watch([checked, () => props.visible], async ([values, visible]) => {
  if (!visible || !props.countForStatus) return
  if (!values.length) {
    estimated.value = 0
    estimateFailed.value = false
    return
  }
  estimating.value = true
  estimateFailed.value = false
  try {
    const totals = await Promise.all(values.map((s) => props.countForStatus!(s)))
    estimated.value = totals.reduce((sum, n) => sum + n, 0)
  } catch {
    estimateFailed.value = true
  } finally {
    estimating.value = false
  }
})

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
    :close-on-overlay-click="false"
    :close-on-esc-keydown="!running"
    @close="onClose"
  >
    <template v-if="running && progress">
      <t-progress :percentage="percent" theme="line" />
      <p class="archive-progress-tip">
        已处理 {{ progress.done }} / {{ progress.total }} 条<template v-if="progress.failed > 0">，失败 {{ progress.failed }} 条</template>，正在执行中…
      </p>
    </template>
    <template v-else>
      <p class="archive-tip">选择需要归档的状态（默认全选）：</p>
      <t-checkbox-group v-model="checked" :disabled="loading">
        <t-checkbox v-for="s in statuses" :key="s.value" :value="s.value">{{ s.label }}</t-checkbox>
      </t-checkbox-group>
      <p v-if="props.countForStatus" class="archive-estimate" :class="{ 'is-error': estimateFailed }">
        <template v-if="estimating">正在统计影响范围…</template>
        <template v-else-if="estimateFailed">影响条数统计失败，可继续执行</template>
        <template v-else>预计影响 {{ estimated ?? '—' }} 条记录</template>
      </p>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <t-button v-if="running" variant="text" theme="default" @click="emit('cancel')">取消执行</t-button>
        <t-button v-else variant="text" theme="default" :disabled="loading" @click="onClose">取消</t-button>
        <t-button
          theme="warning"
          :disabled="!running && checked.length === 0"
          :loading="running || loading"
          @click="onConfirm"
        >
          {{ running ? '归档中…' : '确认归档' }}
        </t-button>
      </div>
    </template>
  </t-dialog>
</template>

<style scoped>
.archive-tip {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--td-text-color-secondary);
}

.archive-estimate {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.archive-estimate.is-error {
  color: var(--td-warning-color);
}

.archive-progress-tip {
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--td-text-color-secondary);
}
</style>
