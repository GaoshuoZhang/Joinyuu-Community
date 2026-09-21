/* URL 安全工具：仅放行 http(s) 绝对地址与站内相对路径。
 * 用户提交的附件/链接可能携带 javascript:、data:、vbscript: 等协议，
 * 直接绑定到 :href 会在点击时执行脚本（存储型 XSS），故统一经此白名单过滤。 */

export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  if (!raw) return undefined
  /* 站内相对路径：'/' 开头且非 '//'（'//host' 是协议相对外链，不允许） */
  if (raw.startsWith('/')) return raw.startsWith('//') ? undefined : raw
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? raw : undefined
  } catch {
    return undefined
  }
}
