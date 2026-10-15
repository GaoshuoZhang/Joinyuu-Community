export interface BulkProgress { done: number; total: number; failed: number }

/** 先收集稳定 ID，再执行写操作，避免边归档边翻页跳过记录。空页/重复页提前失败，禁止静默截断。 */
export async function collectAllPages<T extends { id: string | number }>(
  fetchPage: (page: number, pageSize: number) => Promise<{ list: T[]; total: number }>,
  cancelled: () => boolean = () => false,
): Promise<T[]> {
  const rows = new Map<T['id'], T>()
  for (let page = 1; ; page++) {
    if (cancelled()) return []
    const result = await fetchPage(page, 100)
    if (cancelled()) return []
    const previous = rows.size
    result.list.forEach((row) => rows.set(row.id, row))
    if (rows.size >= result.total) return [...rows.values()]
    if (rows.size === previous || result.list.length === 0) {
      throw new Error('数据范围发生变化，未执行归档，请刷新后重试')
    }
  }
}

export async function executeBulk<T>(
  rows: T[], action: (row: T) => Promise<unknown>, cancelled: () => boolean,
  update: (progress: BulkProgress) => void,
): Promise<BulkProgress> {
  const progress = { done: 0, total: rows.length, failed: 0 }
  update({ ...progress })
  for (const row of rows) {
    if (cancelled()) break
    try { await action(row) } catch { progress.failed++ }
    progress.done++
    update({ ...progress })
  }
  return progress
}
