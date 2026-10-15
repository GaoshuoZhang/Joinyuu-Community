/** 编辑器会将空字符串规范化为空段落；它不代表用户新增了内容。 */
export function normalizeEmptyHtml(value: string): string {
  return /^(?:\s|<p(?:\s[^>]*)?>|<\/p>|<br\s*\/?>(?:\s*)|&nbsp;)*$/i.test(value) ? '' : value
}

/** 快照仅归一空富文本，保留数组顺序、数值与完整业务字段。 */
export function formSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => typeof entry === 'string' ? normalizeEmptyHtml(entry) : entry)
}
