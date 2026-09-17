/* 数据范围（R1）前端契约：域键与菜单分组映射
 * 空数组 = 不限制全部域；超管（permissions 含 '*'）无限制。 */

export interface ScopeOption {
  label: string
  value: string
}

export const scopeOptions: ScopeOption[] = [
  { label: '社区成员', value: 'members' },
  { label: '业务运营', value: 'biz' },
  { label: '空间管理', value: 'space' },
  { label: '内容管理', value: 'contents' },
  { label: '积分管理', value: 'mall' },
  { label: '规则管理', value: 'rules' },
  { label: '系统管理', value: 'system' },
]

const SCOPE_LABELS = new Map(scopeOptions.map((o) => [o.value, o.label]))

export function scopeLabel(code: string): string {
  return SCOPE_LABELS.get(code) ?? code
}

/** 菜单 meta.group（中文分组名）→ 数据范围域键 */
export const GROUP_DOMAIN: Record<string, string> = {
  社区成员: 'members',
  业务运营: 'biz',
  空间管理: 'space',
  内容管理: 'contents',
  积分管理: 'mall',
  规则管理: 'rules',
  系统管理: 'system',
}

/** 数据范围是否放行某菜单分组：超管/空范围/无分组路由放行，否则域须命中 */
export function scopeAllowsGroup(scopeCodes: string[], permissions: string[], group?: string, scopeDomain?: string): boolean {
  if (permissions.includes('*')) return true
  if (scopeCodes.length === 0) return true
  const domain = scopeDomain ?? (group ? GROUP_DOMAIN[group] : undefined)
  if (!domain) return true
  return scopeCodes.includes(domain)
}
