<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDownIcon, ChevronUpIcon, SettingIcon } from 'tdesign-icons-vue-next'
import { restoreColumnState, visibleColumnKeys } from '@/utils/columnState'

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

const requiredKeys = props.columns.filter((c, i) => i === 0 || c.key === 'op').map(c => c.key)
function readSaved() {
  try { return localStorage.getItem(`${STORAGE_PREFIX}${props.storageKey}`) } catch { return null }
}
const state = ref(restoreColumnState(readSaved(), props.columns.map(c => c.key), requiredKeys))
const orderedKeys = computed(() => state.value.order)
const visibleKeys = computed(() => visibleColumnKeys(state.value))
const orderedColumns = computed(() => orderedKeys.value.map(key => props.columns.find(c => c.key === key)!))

function persist() {
  try { localStorage.setItem(`${STORAGE_PREFIX}${props.storageKey}`, JSON.stringify(state.value)) } catch { /* 受限浏览器仍允许本次会话调配 */ }
  emit('update:modelValue', [...visibleKeys.value])
}

function toggle(key: string, checked: boolean) {
  if (checked) {
    if (!state.value.visible.includes(key)) {
      state.value.visible.push(key)
    }
  } else {
    if (requiredKeys.includes(key)) return
    state.value.visible = state.value.visible.filter((k) => k !== key)
  }
  persist()
}

function move(key: string, dir: -1 | 1) {
  const idx = orderedKeys.value.indexOf(key)
  const target = idx + dir
  if (idx < 0 || target < 0 || target >= orderedKeys.value.length) return
  const next = [...orderedKeys.value]
  ;[next[idx], next[target]] = [next[target], next[idx]]
  state.value.order = next
  persist()
}

function onReset() {
  state.value = restoreColumnState(null, props.columns.map(c => c.key), requiredKeys)
  persist()
}

const visible = ref(false)

/* ESC 关闭：t-popup 仅 trigger=focus 时内置 ESC 处理，click 触发需自行监听 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) visible.value = false
}

/* 挂载即上报已保存顺序（恢复持久化列配置） */
onMounted(() => {
  emit('update:modelValue', [...visibleKeys.value])
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
    <t-button variant="outline" :class="{ 'is-active': visible }" title="列设置" aria-label="列设置">
      <template #icon><SettingIcon /></template>
    </t-button>
    <template #content>
      <div class="col-panel">
        <div class="col-panel-head">
          <span class="col-panel-title">列设置</span>
          <t-popconfirm content="确认重置列配置？当前列显隐与顺序将恢复为默认。" confirm-btn="重置" @confirm="onReset">
            <t-button variant="text" size="small">重置</t-button>
          </t-popconfirm>
        </div>
        <div class="col-list">
          <div v-for="(c, index) in orderedColumns" :key="c.key" class="col-row" :class="{ merged: !visibleKeys.includes(c.key) }">
            <t-checkbox
              :checked="visibleKeys.includes(c.key)"
              :disabled="requiredKeys.includes(c.key)"
              class="col-check"
              @change="(v: boolean) => toggle(c.key, v)"
            >
              {{ c.title }}
            </t-checkbox>
            <div class="col-move">
              <t-button variant="text" size="small" shape="square" :disabled="index === 0" :aria-label="`上移${c.title}`" @click="move(c.key, -1)"><template #icon><ChevronUpIcon /></template></t-button>
              <t-button variant="text" size="small" shape="square" :disabled="index === orderedColumns.length - 1" :aria-label="`下移${c.title}`" @click="move(c.key, 1)"><template #icon><ChevronDownIcon /></template></t-button>
            </div>
          </div>
        </div>
        <p class="col-tip">勾选控制显隐，↑↓ 调整顺序；识别列和操作列始终保留。配置保存在本地浏览器。</p>
      </div>
    </template>
  </t-popup>
</template>

<style scoped>
/* 弹层展开时触发器给出可见激活态（品牌色与 .stat-card.is-active 同口径） */
.is-active {
  color: var(--td-brand-color);
  border-color: var(--td-brand-color);
}

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
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.col-list {
  max-height: 260px;
  overflow-y: auto;
  overscroll-behavior: contain;
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

.col-tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
