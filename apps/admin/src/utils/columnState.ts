export interface ColumnState {
  version: 2
  knownKeys: string[]
  order: string[]
  visible: string[]
}

/** 保存全量列结构，区分用户隐藏的列和版本更新后新增的列。 */
export function restoreColumnState(raw: string | null, keys: string[], required: string[]): ColumnState {
  let saved: unknown
  try { saved = raw ? JSON.parse(raw) : null } catch { saved = null }
  const valid = (value: unknown): string[] => Array.isArray(value)
    ? [...new Set(value.filter((key): key is string => typeof key === 'string' && keys.includes(key)))] : []
  const record = saved && !Array.isArray(saved) && typeof saved === 'object' ? saved as Partial<ColumnState> : null
  const isCurrent = record?.version === 2 && Array.isArray(record.knownKeys) && Array.isArray(record.order) && Array.isArray(record.visible)
  const legacy = Array.isArray(saved)
  const order = isCurrent ? valid(record.order) : legacy ? valid(saved) : [...keys]
  const newKeys = isCurrent ? keys.filter(key => !record.knownKeys!.includes(key)) : []
  const visible = isCurrent ? valid(record.visible) : legacy ? valid(saved) : [...keys]
  return {
    version: 2,
    knownKeys: [...keys],
    order: [...order, ...keys.filter(key => !order.includes(key))],
    visible: [...new Set([...visible, ...newKeys, ...required.filter(key => keys.includes(key))])],
  }
}

export function visibleColumnKeys(state: ColumnState): string[] {
  return state.order.filter(key => state.visible.includes(key))
}
