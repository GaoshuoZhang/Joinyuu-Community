/* 列表导出（M0 前端直出 CSV；M1 可平滑替换为服务端导出接口，调用点不变） */
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
