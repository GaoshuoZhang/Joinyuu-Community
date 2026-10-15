export interface SmsTemplateMapping { code: string; templateId: string }

/** 停用状态下仍显示最近保存的固定配置，避免切换供应商后回显旧档案。 */
export function fixedChannelOfKind<T extends { kind: string; enabled: boolean; updatedAt: string }>(rows: T[], kind: string): T | undefined {
  const matches = rows.filter(row => row.kind === kind)
  return matches.find(row => row.enabled) ?? matches.reduce<T | undefined>((latest, row) =>
    !latest || row.updatedAt > latest.updatedAt ? row : latest, undefined)
}

/** 字段式模板配置；避免重复编码、半填行或空映射覆盖已有短信模板。 */
export function buildSmsTemplateMapping(rows: SmsTemplateMapping[]): Record<string, string> {
  const entries: [string, string][] = []
  const codes = new Set<string>()
  for (const row of rows) {
    const code = row.code.trim()
    const id = row.templateId.trim()
    if (!code && !id) continue
    if (!code || !id) throw new Error('请完整填写通知模板编码和供应商模板编号')
    if (codes.has(code)) throw new Error(`通知模板编码「${code}」重复`)
    codes.add(code)
    entries.push([code, id])
  }
  if (!entries.length) throw new Error('请至少配置一个短信模板编号')
  return Object.fromEntries(entries)
}
