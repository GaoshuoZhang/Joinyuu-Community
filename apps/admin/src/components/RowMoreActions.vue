<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDownIcon } from 'tdesign-icons-vue-next'

const visible = ref(false)
const trigger = ref<{ $el?: HTMLElement }>()
const panel = ref<HTMLElement>()
async function focusFirstAction() {
  await nextTick()
  let frames = 0
  const focusWhenVisible = () => {
    if (!visible.value) return
    const button = panel.value?.querySelector<HTMLButtonElement>('button:not([disabled])')
    if (!button) return
    // Popup 首次挂载时先隐藏定位，待实际可见后再转移焦点。
    if (button.getClientRects().length && getComputedStyle(button).visibility === 'visible') button.focus()
    else if (++frames < 30) requestAnimationFrame(focusWhenVisible)
  }
  requestAnimationFrame(focusWhenVisible)
}
watch(panel, focusFirstAction)
async function onVisibleChange(value: boolean) {
  visible.value = value
  if (value) {
    await focusFirstAction()
  }
}
function onEscape(event: KeyboardEvent) {
  event.preventDefault()
  visible.value = false
  trigger.value?.$el?.focus()
}

/* 点击选项或空白处收回：文档级监听兜底空白点击（含 popup 遮罩） */
function onDocumentClick(event: MouseEvent) {
  if (!visible.value) return
  const target = event.target as HTMLElement | null
  if (!target) return
  if (trigger.value?.$el?.contains(target) || panel.value?.contains(target)) return
  visible.value = false
}
/* 下级二次确认浮层（t-popconfirm）是否可见：其浮层根类名为 t-popconfirm，挂载在 body。
 * 该浮层以面板内按钮为锚点，若点击时立即收回面板，锚点被隐藏会导致确认框一闪而过 */
function hasVisibleConfirm(): boolean {
  return Array.from(document.querySelectorAll('.t-popconfirm')).some((node) => {
    const el = node as HTMLElement
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
  })
}

/* 点击选项收回菜单：选项若打开了下级二次确认浮层则保持展开（收回会让确认框锚点被隐藏而消失），
 * 待用户确认/取消（确认框按钮在 body 浮层上，属面板外）后由文档级监听兜底收回。
 * 确认浮层是点击后异步挂载的，用 MutationObserver 侦测挂载（不依赖帧/定时器时序），
 * 探测窗口内未出现浮层即视为普通选项，收回菜单 */
const CLOSE_PROBE_MS = 300
let probeObserver: MutationObserver | null = null
let probeTimer: number | null = null

function stopProbe() {
  probeObserver?.disconnect()
  probeObserver = null
  if (probeTimer !== null) {
    window.clearTimeout(probeTimer)
    probeTimer = null
  }
}

function onPanelClick() {
  stopProbe()
  probeObserver = new MutationObserver(() => {
    if (hasVisibleConfirm()) stopProbe()
  })
  probeObserver.observe(document.body, { childList: true, subtree: true })
  probeTimer = window.setTimeout(() => {
    stopProbe()
    if (!hasVisibleConfirm()) visible.value = false
  }, CLOSE_PROBE_MS)
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => {
  stopProbe()
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <t-popup :visible="visible" trigger="click" placement="bottom-right" @visible-change="onVisibleChange">
    <t-button ref="trigger" variant="text" size="small" :aria-expanded="visible" @keydown.esc="onEscape">
      更多<template #suffix><ChevronDownIcon /></template>
    </t-button>
    <template #content>
      <div ref="panel" class="row-more-actions" role="group" aria-label="更多操作" @keydown.esc="onEscape" @click.stop="onPanelClick">
        <slot />
      </div>
    </template>
  </t-popup>
</template>

<style scoped>
.row-more-actions { display: flex; flex-direction: column; align-items: stretch; min-width: 120px; gap: 4px; padding: 4px; }
.row-more-actions :deep(.t-button) { width: 100%; min-height: 28px; justify-content: flex-start; }
</style>
