import { nextTick } from 'vue'

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
