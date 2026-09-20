/* 列表导出（前端直出 CSV；后续可平滑替换为服务端导出接口，调用点不变） */
import { statusMap } from '@/constants/status'

/* 状态标签转文案（导出用）：entity 对应 constants/status.ts 的 statusMap 键 */
export function statusLabel(entity: string, value: string | undefined): string {
  if (!value) return ''
  const map = (statusMap as unknown as Record<string, Record<string, { label: string }>>)[entity]
  return map?.[value]?.label ?? value
}

/* 导出当前列表为 CSV（带 BOM，Excel 直接打开不乱码） */
export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number | undefined | null) => {
    const s = String(v ?? '')
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  a.href = url
  a.download = `${filename}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* 全量导出：按现有分页接口拉取全部数据后导出 CSV。
 * 前端逐页拉取 + 本地组装（全量数据量级在可控范围内）；服务端导出落地后切换为直接下载接口。
 * 返回导出行数。 */
export async function exportAllRows<T>(
  filename: string,
  headers: string[],
  mapper: (item: T) => (string | number)[],
  fetchPage: (page: number, pageSize: number) => Promise<{ list: T[]; total: number }>,
): Promise<number> {
  const pageSize = 100
  const rows: (string | number)[][] = []
  const first = await fetchPage(1, pageSize)
  rows.push(...first.list.map(mapper))
  const pages = Math.ceil(first.total / pageSize)
  for (let p = 2; p <= pages; p++) {
    const r = await fetchPage(p, pageSize)
    rows.push(...r.list.map(mapper))
  }
  exportCsv(filename, headers, rows)
  return rows.length
}
