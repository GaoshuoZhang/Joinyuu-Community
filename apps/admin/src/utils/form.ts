import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { confirmDialog } from '@/utils/confirmDialog'
import { formSnapshot } from './formSnapshot'

type FormInstanceLike = { $el?: HTMLElement } | null | undefined

/** 校验失败后滚动并聚焦首个错误控件。 */
export async function focusFirstInvalid(form?: FormInstanceLike): Promise<void> {
  await nextTick()
  const root = form?.$el ?? document
  const field = root.querySelector<HTMLElement>(
    '.t-is-error input:not([disabled]), .t-is-error textarea:not([disabled]), .t-is-error [role="combobox"], .t-is-error button:not([disabled]), .t-is-error [contenteditable="true"], .t-form__item--error input:not([disabled]), .t-form__item--error textarea:not([disabled]), [aria-invalid="true"]',
  )
  if (!field) return
  /* 平滑滚动仅在用户未要求减少动效时启用（CSS 的 reduced-motion 兜底不覆盖 scrollIntoView） */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  field.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  field.focus({ preventScroll: true })
}

/**
 * 表单对话框未保存保护：打开时 markBaseline() 记录基线快照，
 * guardClose() 在关闭前检测改动，有改动时弹出确认（confirmDialog，已抬高层级避开业务浮层遮盖）。
 */
export function useDialogDirtyGuard(form: object | (() => unknown)) {
  const baseline = ref('')
  const snapshot = () => formSnapshot(typeof form === 'function' ? form() : form)
  function markBaseline() {
    baseline.value = snapshot()
  }
  const isDirty = computed(() => baseline.value !== '' && snapshot() !== baseline.value)
  function guardClose(onClose: () => void, action = '关闭') {
    if (!isDirty.value) {
      onClose()
      return
    }
    const dialog = confirmDialog({
      header: '放弃未保存的修改？',
      body: `当前内容尚未保存，${action}后将丢失这些修改。`,
      confirmBtn: `放弃修改并${action}`,
      cancelBtn: '继续编辑',
      theme: 'warning',
      onConfirm: () => {
        dialog.destroy()
        onClose()
      },
      onClose: () => dialog.destroy(),
      onCancel: () => dialog.destroy(),
    })
  }
  return { markBaseline, isDirty, guardClose }
}

/** 页面导航、刷新及关闭窗口均保护未保存内容。 */
export function usePageDirtyGuard(isDirty: Readonly<Ref<boolean>>) {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
  onBeforeRouteLeave(() => {
    if (!isDirty.value) return true
    return new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (leave: boolean) => {
        if (settled) return
        settled = true
        dialog.destroy()
        resolve(leave)
      }
      const dialog = confirmDialog({
        header: '放弃未保存的修改？',
        body: '当前内容尚未保存，离开后将丢失这些修改。',
        confirmBtn: '放弃修改并离开',
        cancelBtn: '继续编辑',
        theme: 'warning',
        onConfirm: () => settle(true),
        onCancel: () => settle(false),
        onClose: () => settle(false),
      })
    })
  })
}

/** 内嵌表单统一保护：初始化完成后记录基线，保存成功可直接关闭。 */
export function useDialogFormProtection(form: object | (() => unknown), visible: Ref<boolean>, busy?: Readonly<Ref<boolean>>) {
  const guard = useDialogDirtyGuard(form)
  watch(visible, async (open) => {
    if (!open) return
    await nextTick()
    guard.markBaseline()
  })
  usePageDirtyGuard(computed(() => visible.value && guard.isDirty.value))
  const close = () => {
    if (busy?.value) return
    guard.guardClose(() => { visible.value = false })
  }
  return { ...guard, close }
}
