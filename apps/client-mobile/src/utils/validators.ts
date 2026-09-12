/* 表单校验规则：双端共享（桌面/移动视图层只调用，文案与后端口径一致） */

export const PHONE_MSG = '请输入正确的 11 位手机号'
export const PASSWORD_MSG = '密码至少 8 位，且同时包含字母与数字'
export const REQUIRED = (label: string) => `请输入${label}`

export function isPhone(value: string): boolean {
  return /^1\d{10}$/.test(value)
}

/** 密码强度与 admin 同口径：≥8 位且同时包含字母与数字 */
export function isPasswordStrong(value: string): boolean {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value)
}

export function isCaptcha(value: string): boolean {
  return value.trim().length > 0
}
