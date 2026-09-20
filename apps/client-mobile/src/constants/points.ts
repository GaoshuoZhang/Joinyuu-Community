/* 积分流水来源词汇表：API 下发英文来源码，前台一律转中文展示 */

export const POINTS_SOURCE_LABELS: Record<string, string> = {
  rule: '自动发放',
  manual: '手动发放',
  redemption: '商城兑换',
}

/** 来源码 → 中文；未知码原样返回，兼容历史中文来源（如 Mock 数据）。 */
export function pointsSourceLabel(source?: string | null): string {
  if (!source) return '积分变动'
  return POINTS_SOURCE_LABELS[source] ?? source
}
