import { computed, nextTick, ref } from 'vue'
import { DialogPlugin } from 'tdesign-vue-next'

type FormInstanceLike = { $el?: HTMLElement } | null | undefined

/** 校验失败后滚动并聚焦首个错误控件。 */
export async function focusFirstInvalid(form?: FormInstanceLike): Promise<void> {
  await nextTick()
  const root = form?.$el ?? document
  const field = root.querySelector<HTMLElement>(
    '.t-is-error input:not([disabled]), .t-is-error textarea:not([disabled]), .t-is-error [role="combobox"], .t-is-error button:not([disabled]), .t-form__item--error input:not([disabled]), .t-form__item--error textarea:not([disabled])',
  )
  if (!field) return
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
  field.focus({ preventScroll: true })
}

/**
 * 表单对话框未保存保护：打开时 markBaseline() 记录基线快照，
 * guardClose() 在关闭前检测改动，有改动时弹出确认（TDesign DialogPlugin）。
 */
export function useDialogDirtyGuard(form: object) {
  const baseline = ref('')
  function markBaseline() {
    baseline.value = JSON.stringify(form)
  }
  const isDirty = computed(() => baseline.value !== '' && JSON.stringify(form) !== baseline.value)
  function guardClose(onClose: () => void) {
    if (!isDirty.value) {
      onClose()
      return
    }
    const dialog = DialogPlugin.confirm({
      header: '放弃未保存的修改？',
      body: '当前内容尚未保存，关闭后将丢失这些修改。',
      confirmBtn: '放弃修改并关闭',
      cancelBtn: '继续编辑',
      theme: 'warning',
      onConfirm: () => {
        dialog.destroy()
        onClose()
      },
      onClose: () => dialog.destroy(),
    })
  }
  return { markBaseline, isDirty, guardClose }
}
