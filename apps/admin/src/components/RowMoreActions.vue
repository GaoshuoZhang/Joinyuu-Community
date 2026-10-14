<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
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
</script>

<template>
  <t-popup :visible="visible" trigger="click" placement="bottom-right" @visible-change="onVisibleChange">
    <t-button ref="trigger" variant="text" size="small" :aria-expanded="visible" @keydown.esc="onEscape">
      更多<template #suffix><ChevronDownIcon /></template>
    </t-button>
    <template #content>
      <div ref="panel" class="row-more-actions" role="group" aria-label="更多操作" @keydown.esc="onEscape" @click.stop>
        <slot />
      </div>
    </template>
  </t-popup>
</template>

<style scoped>
.row-more-actions { display: flex; flex-direction: column; align-items: stretch; min-width: 120px; gap: 4px; padding: 4px; }
.row-more-actions :deep(.t-button) { width: 100%; min-height: 28px; justify-content: flex-start; }
</style>
