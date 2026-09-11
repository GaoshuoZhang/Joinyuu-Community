<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDownIcon, ChevronUpIcon, SettingIcon } from 'tdesign-icons-vue-next'

/* 列显示配置：列显隐 + 顺序调整，localStorage 持久化。
 * v-model 为列 key 顺序数组（含显隐信息：不在数组中的列隐藏）。
 * 注意：父级传入的 columns 多为内联映射数组（每次渲染新增引用），
 * 因此只在挂载时按「列结构」初始化一次，不在渲染过程中重置用户调配。 */

export interface ColumnOption {
  key: string
  title: string
}

const props = withDefaults(
  defineProps<{
    columns: ColumnOption[]
    /** 持久化键（按页面区分，如 'users'） */
    storageKey: string
    modelValue: string[]
  }>(),
  {
    modelValue: () => [],
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string[]): void
}>()

const STORAGE_PREFIX = 'joinyuu_cols_'

function loadSaved(): string[] | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${props.storageKey}`)
  if (!raw) return null
  try {
    const keys = JSON.parse(raw) as string[]
    if (!Array.isArray(keys)) return null
    // 仅保留仍存在的列，防止列结构调整后残留脏 key
    const valid = props.columns.map((c) => c.key)
    return keys.filter((k) => valid.includes(k))
  } catch {
    return null
  }
}

/* 未保存过 → 默认全显（全部列，保持初始顺序）；保存过但列结构已变（如新增列）→ 新列补到末尾 */
function initKeys(): string[] {
  const saved = loadSaved()
  if (saved) {
    const current = props.columns.map((c) => c.key)
    const newOnes = current.filter((k) => !saved.includes(k))
    return newOnes.length ? [...saved, ...newOnes] : saved
  }
  return props.columns.map((c) => c.key)
}

const orderedKeys = ref<string[]>(initKeys())

function persist() {
  localStorage.setItem(`${STORAGE_PREFIX}${props.storageKey}`, JSON.stringify(orderedKeys.value))
  emit('update:modelValue', [...orderedKeys.value])
}

function toggle(key: string, checked: boolean) {
  if (checked) {
    if (!orderedKeys.value.includes(key)) {
      // 重新启用时追加到末尾
      orderedKeys.value = [...orderedKeys.value, key]
    }
  } else {
    orderedKeys.value = orderedKeys.value.filter((k) => k !== key)
  }
  persist()
}

function move(key: string, dir: -1 | 1) {
  const idx = orderedKeys.value.indexOf(key)
  const target = idx + dir
  if (idx < 0 || target < 0 || target >= orderedKeys.value.length) return
  const next = [...orderedKeys.value]
  ;[next[idx], next[target]] = [next[target], next[idx]]
  orderedKeys.value = next
  persist()
}

function onReset() {
  orderedKeys.value = props.columns.map((c) => c.key)
  persist()
}

const visible = ref(false)

/* ESC 关闭：t-popup 仅 trigger=focus 时内置 ESC 处理，click 触发需自行监听 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) visible.value = false
}

/* 挂载即上报已保存顺序（恢复持久化列配置） */
onMounted(() => {
  emit('update:modelValue', [...orderedKeys.value])
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <t-popup
    v-model:visible="visible"
    trigger="click"
    placement="bottom-right"
    :show-arrow="false"
    :overlay-style="{ padding: '0' }"
    :overlay-inner-style="{ background: 'transparent', boxShadow: 'none', borderRadius: '0', padding: '0' }"
  >
    <t-button variant="outline" :class="{ 'is-active': visible }" title="列设置">
      <template #icon><SettingIcon /></template>
    </t-button>
    <template #content>
      <div class="col-panel">
        <div class="col-panel-head">
          <span class="col-panel-title">列设置</span>
          <t-link theme="primary" hover="color" size="small" @click="onReset">重置</t-link>
        </div>
        <div class="col-list">
          <div v-for="c in columns" :key="c.key" class="col-row" :class="{ merged: !orderedKeys.includes(c.key) }">
            <t-checkbox
              :checked="orderedKeys.includes(c.key)"
              class="col-check"
              @change="(v: boolean) => toggle(c.key, v)"
            >
              {{ c.title }}
            </t-checkbox>
            <div class="col-move">
              <ChevronUpIcon class="col-move-btn" @click="move(c.key, -1)" />
              <ChevronDownIcon class="col-move-btn" @click="move(c.key, 1)" />
            </div>
          </div>
        </div>
        <p class="col-tip">勾选控制显隐，↑↓ 调整顺序；配置保存在本地浏览器。</p>
      </div>
    </template>
  </t-popup>
</template>

<style scoped>
.col-panel {
  width: 220px;
  padding: 8px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  box-shadow: var(--td-shadow-2);
}

.col-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.col-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.col-list {
  max-height: 260px;
  overflow-y: auto;
}

.col-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 0;
  border-radius: var(--td-radius-small);
}

.col-row:hover {
  background: var(--td-bg-color-container-hover);
}

.col-row.merged .col-check {
  opacity: 0.5;
}

.col-move {
  display: flex;
  gap: 2px;
}

.col-move-btn {
  font-size: 16px;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
}

.col-move-btn:hover {
  color: var(--td-brand-color);
}

.col-tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>