/* 积分消费折扣：1 = 1 折 … 10 = 原价，支持一位小数（8.5 = 85 折；等级规则页按等级配置）。
 * 与后端 apps/api/src/common/points/points-discount.ts 同一算法（内部按十分位整数计算，避免浮点误差），
 * 仅用于展示与余额预判（实扣以后端为准）。 */

export const FULL_PRICE_DISCOUNT = 10

/** 折扣 → 十分位整数（10 = 1 折 … 100 = 原价）；非法/越界一律按原价（100） */
export function discountTenths(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100
  const tenths = Math.round(value * 10)
  return tenths >= 10 && tenths <= 100 ? tenths : 100
}

/** 折扣归一：保留一位小数；非法/越界按原价（10） */
export function normalizeDiscount(value?: number | null): number {
  return discountTenths(value) / 10
}

/** 折后积分 = round(原价 × 折扣 ÷ 10)；原价 ≤ 0 返回 0，原价折扣直接返回原价 */
export function discountedPoints(price: number, discount?: number | null): number {
  if (price <= 0) return 0
  const tenths = discountTenths(discount)
  if (tenths === 100) return price
  return Math.round((price * tenths) / 100)
}

/** 折扣文案（无前后缀）：'原价' / '8.5 折' */
export function discountText(discount?: number | null): string {
  const tenths = discountTenths(discount)
  return tenths === 100 ? '原价' : `${tenths / 10} 折`
}

/** 折扣文案（后缀用法，原价返回空串）：8.5 折 → '8.5 折' */
export function discountLabel(discount?: number | null): string {
  return discountTenths(discount) === 100 ? '' : discountText(discount)
}