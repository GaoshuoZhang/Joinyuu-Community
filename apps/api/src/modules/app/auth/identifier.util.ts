/* 登录标识解析：手机号 / 邮箱 / 用户名（顺序即优先级）。
 * 这是服务端「按标识定位账号」的唯一口径入口（AuthService.findByIdentifier 使用）；
 * 客户端 apps/client-mobile/src/utils/validators.ts 的 parseIdentifier 必须与本文件逐条一致，
 * 任一侧改规则都要同步另一侧（两处均有互相指向的注释）。 */

/** 邮箱格式：与 email-code.service.ts 的 normalizeEmail 同口径（那边是权威实现，改这里必须同步） */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 手机号规整：去空格/分隔符 + 去 +86 前缀（与 sms-code.service.ts 的 normalizePhone 同口径） */
function normalizePhone(input: string): string {
  return input.replace(/[\s-]/g, '').replace(/^\+?86/, '')
}

export interface ParsedIdentifier {
  kind: 'phone' | 'email' | 'username'
  /** 归一化后的值：手机号为 11 位数字、邮箱小写、用户名 trim 后小写（与 users.username 存储口径一致） */
  value: string
}

/** 解析登录标识；空串或纯空白返回 null。仅做形态判定，不校验账号是否存在。 */
export function parseIdentifier(raw: string | null | undefined): ParsedIdentifier | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const phone = normalizePhone(trimmed)
  if (/^1\d{10}$/.test(phone)) return { kind: 'phone', value: phone }
  const email = trimmed.toLowerCase()
  if (EMAIL_PATTERN.test(email)) return { kind: 'email', value: email }
  return { kind: 'username', value: trimmed.toLowerCase() }
}
