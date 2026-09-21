/* 表单校验规则：双端共享（桌面/移动视图层只调用，文案与后端口径一致） */

export const PHONE_MSG = '请输入正确的 11 位手机号'
export const EMAIL_MSG = '请输入正确的邮箱地址'
export const PASSWORD_MSG = '密码至少 8 位，且同时包含字母与数字'
export const USERNAME_MSG = '用户名需以字母开头，4-20 位，仅可包含字母、数字与下划线'
export const USERNAME_RESERVED_MSG = '该用户名为系统保留，请更换'
export const NICKNAME_MSG = '请输入昵称'
export const NICKNAME_TOO_LONG_MSG = '昵称不能超过 20 个字符'
export const NICKNAME_RESERVED_MSG = '该昵称为系统保留，请更换'
export const CODE_MSG = '请输入 6 位验证码'
export const REQUIRED = (label: string) => `请输入${label}`

export function isPhone(value: string): boolean {
  return /^1\d{10}$/.test(value)
}

/** 邮箱格式：与后端 class-validator 的 IsEmail 大致同口径（本地仅做基础拦截） */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** 用户名格式：字母开头，4-20 位，仅字母/数字/下划线（与后端 USERNAME_PATTERN 一致） */
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{3,19}$/

export function isUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value.trim())
}

/** 昵称：trim 后 1-20 字符（中文按 1 字符计） */
export function isNickname(value: string): boolean {
  const length = [...value.trim()].length
  return length >= 1 && length <= 20
}

/** 密码强度与 admin 同口径：≥8 位且同时包含字母与数字 */
export function isPasswordStrong(value: string): boolean {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value)
}

export function isCaptcha(value: string): boolean {
  return value.trim().length > 0
}

/** 6 位数字验证码（短信/邮箱验证码同口径） */
export function isSmsCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim())
}

/** 保留用户名（比较前统一小写；与后端 RESERVED_USERNAMES 保持一致） */
export const RESERVED_USERNAMES: readonly string[] = [
  'admin', 'administrator', 'superadmin', 'super', 'root', 'system', 'sys',
  'official', 'joinyuu', 'community', 'moderator', 'staff', 'support', 'service',
  'help', 'helpdesk', 'security', 'api', 'www', 'mail', 'email', 'smtp', 'sms',
  'test', 'guest', 'user', 'users', 'anonymous', 'owner', 'operator', 'manager',
  'master', 'webmaster', 'postmaster', 'hostmaster', 'noreply', 'no_reply',
  'info', 'contact', 'sales', 'market', 'finance', 'hr', 'legal', 'dev',
  'developer', 'qa', 'ops', 'cdn', 'static', 'assets', 'img', 'images',
  'upload', 'uploads', 'null', 'undefined', 'true', 'false', 'delete', 'login',
  'logout', 'register', 'account', 'profile', 'settings',
]

/** 保留昵称（ASCII 比较前统一小写，中文按原样；与后端 RESERVED_NICKNAMES 保持一致） */
export const RESERVED_NICKNAMES: readonly string[] = [
  'admin', 'administrator', 'superadmin', 'root', 'system', 'official',
  'joinyuu', 'community', 'moderator', 'staff', 'support', 'service',
  'customer', 'kefu', 'guest', 'anonymous', 'test', 'null', 'undefined',
  '管理员', '超级管理员', '系统', '系统管理员', '官方', '官方账号', '官方客服',
  '客服', '客服中心', '聚屿', '聚屿社区', '社区管理员', '运营', '运营团队',
  '工作人员', '小编', '助手', '匿名', '游客', '测试', '测试用户', '版主',
  '审核员', '财务', '法务', '人力资源', '媒体', '新闻', '通知', '提醒',
]

export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAMES.includes(value.trim().toLowerCase())
}

export function isReservedNickname(value: string): boolean {
  const trimmed = value.trim()
  return RESERVED_NICKNAMES.includes(trimmed.toLowerCase()) || RESERVED_NICKNAMES.includes(trimmed)
}

/** URL 白名单：仅放行 http(s) 绝对地址与站内相对路径。
 * 用户提交的附件/名片链接可能携带 javascript:/data: 等协议，直接绑定 :href 会执行脚本（存储型 XSS）。
 * 含反斜杠或控制字符的地址一律拒绝：WHATWG 会把 '\\' 视作 '/'，可借此把外域伪装成站内路径。 */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  if (!raw) return undefined
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return undefined
  /* 站内相对路径：用 URL 解析判定同源（'//host' 会解析为外域 → 拒绝） */
  if (raw.startsWith('/')) {
    try {
      return new URL(raw, location.origin).origin === location.origin ? raw : undefined
    } catch {
      return undefined
    }
  }
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? raw : undefined
  } catch {
    return undefined
  }
}
