/** 金额展示统一口径：接口金额均为整数分，客户端只做展示，不参与结算。 */

/** 整数分 → 「¥1,234.50」（默认两位小数） */
export function formatFen(fen: number, options: { symbol?: boolean; grouping?: boolean } = {}): string {
  const safe = Number.isFinite(fen) ? Math.round(fen) : 0
  const yuan = safe / 100
  const text = options.grouping === false
    ? yuan.toFixed(2)
    : new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(yuan)
  return options.symbol === false ? text : `¥${text}`
}

/** 整数分 → 「1,234.50」（不带货币符号） */
export function formatFenPlain(fen: number): string {
  return formatFen(fen, { symbol: false })
}

/** 整数分 → 元（仅用于展示辅助，不用于计算应收） */
export function fenToYuan(fen: number): number {
  return (Number.isFinite(fen) ? Math.round(fen) : 0) / 100
}
