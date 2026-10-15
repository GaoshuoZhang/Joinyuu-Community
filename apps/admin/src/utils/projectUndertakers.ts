/** 自定义主体使用可逆名称键；兼容历史 refId 为空的记录，避免多个主体都回填为 custom:。 */
export function undertakerValue(row: { type: string; id: string; name: string }): string {
  return row.type === 'custom' ? `custom:${encodeURIComponent(row.name)}` : `${row.type}:${row.id}`
}

export function customUndertakerName(value: string): string {
  if (!value.startsWith('custom:')) return value
  try { return decodeURIComponent(value.slice(7)) } catch { return value.slice(7) }
}
