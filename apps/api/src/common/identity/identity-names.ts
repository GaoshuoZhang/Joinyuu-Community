/* 用户身份名规则（username / nickname）：
 * - username：登录标识之一，全站唯一；仅英文字母/数字/下划线，须以字母开头；注册后自动分配 user_ + 随机码
 * - nickname：展示用昵称，全站唯一；允许中文；与 username 是两套独立概念（昵称≠用户名）
 * - 两者各有「保留名单」（admin / 管理员 等常见词），不允许用户占用
 * 纯函数（无 DB 依赖），DB 唯一性判定见 IdentityNameService。 */

/** 用户名格式：字母开头，4-20 位，仅字母/数字/下划线 */
export const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{3,19}$/
export const USERNAME_MIN_LENGTH = 4
export const USERNAME_MAX_LENGTH = 20
/** 昵称长度上限（中文按 1 字符计） */
export const NICKNAME_MAX_LENGTH = 20
/** 昵称允许字符：不限字符集（支持中文/符号/表情），仅约束长度与非空 */

/** 保留用户名（比较前统一小写） */
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

/** 保留昵称（ASCII 比较前统一小写，中文按原样） */
export const RESERVED_NICKNAMES: readonly string[] = [
  'admin', 'administrator', 'superadmin', 'root', 'system', 'official',
  'joinyuu', 'community', 'moderator', 'staff', 'support', 'service',
  'customer', 'kefu', 'guest', 'anonymous', 'test', 'null', 'undefined',
  '管理员', '超级管理员', '系统', '系统管理员', '官方', '官方账号', '官方客服',
  '客服', '客服中心', '聚屿', '聚屿社区', '社区管理员', '运营', '运营团队',
  '工作人员', '小编', '助手', '匿名', '游客', '测试', '测试用户', '版主',
  '审核员', '财务', '法务', '人力资源', '媒体', '新闻', '通知', '提醒',
]

/** 用户名归一化：去空白 + 转小写（登录与唯一性判定均以此口径比较） */
export function normalizeUsername(input: string | null | undefined): string {
  return (input ?? '').trim().toLowerCase()
}

/** 用户名保留词判定 */
export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.includes(normalizeUsername(username))
}

/** 用户名格式校验；合法返回 null，否则返回中文错误文案 */
export function usernameFormatError(username: string): string | null {
  const value = (username ?? '').trim()
  if (!value) return '请输入用户名'
  if (!USERNAME_PATTERN.test(value)) {
    return `用户名需以字母开头，${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 位，仅可包含字母、数字与下划线`
  }
  if (isReservedUsername(value)) return '该用户名为系统保留，请更换'
  return null
}

/** 昵称保留词判定（ASCII 忽略大小写） */
export function isReservedNickname(nickname: string): boolean {
  const value = (nickname ?? '').trim()
  if (RESERVED_NICKNAMES.includes(value.toLowerCase())) return true
  return RESERVED_NICKNAMES.includes(value)
}

/** 昵称格式校验；合法返回 null，否则返回中文错误文案 */
export function nicknameFormatError(nickname: string): string | null {
  const value = (nickname ?? '').trim()
  if (!value) return '请输入昵称'
  if ([...value].length > NICKNAME_MAX_LENGTH) return `昵称不能超过 ${NICKNAME_MAX_LENGTH} 个字符`
  if (isReservedNickname(value)) return '该昵称为系统保留，请更换'
  return null
}

const RANDOM_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** 用户名候选：user_ + 8 位随机小写字母/数字（满足格式与字母开头） */
export function generateUsernameCandidate(): string {
  let suffix = ''
  for (let i = 0; i < 8; i += 1) {
    suffix += RANDOM_ALPHABET[Math.floor(Math.random() * RANDOM_ALPHABET.length)]
  }
  return `user_${suffix}`
}

/** 昵称候选：岛民 + 6 位随机数字（中文昵称，需再经唯一性检查） */
export function generateNicknameCandidate(): string {
  const digits = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
  return `岛民${digits}`
}
