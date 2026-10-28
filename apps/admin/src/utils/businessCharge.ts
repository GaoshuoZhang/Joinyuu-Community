import type { FormProps } from 'tdesign-vue-next'

export interface BusinessCharge { chargeAmountFen?: number; chargeRefundPolicy?: string }
export function chargeFields(source?: BusinessCharge | null) {
  return { chargeAmountFen: source?.chargeAmountFen ?? 0, chargeRefundPolicy: source?.chargeRefundPolicy ?? '' }
}
export function chargeRules(form: BusinessCharge): FormProps['rules'] {
  return {
    chargeAmountFen: [{ validator: () => Number.isSafeInteger(form.chargeAmountFen) && form.chargeAmountFen! >= 0 && form.chargeAmountFen! <= 100_000_000, message: '金额须为 0 至 1,000,000.00 元，最多两位小数', trigger: 'submit' }],
    chargeRefundPolicy: [{ validator: () => !form.chargeAmountFen || !!form.chargeRefundPolicy?.trim(), message: '请填写退款条件、期限与交付约定', trigger: 'submit' }],
  }
}
