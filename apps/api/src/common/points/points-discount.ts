import type { Prisma } from '@prisma/client'

/* 积分消费折扣唯一口径（等级规则页「积分消费折扣」列）：
 * 1 = 1 折 … 10 = 原价，支持一位小数（8.5 = 85 折）；折后价 = round(原价 × 折扣 ÷ 10)，不足 1 分四舍五入。
 * 内部一律换算成「十分位整数」计算（85 = 8.5 折，100 = 原价），避免浮点误差（如 8.1 × 50）。
 * 取哪一级：
 *  - 个人消费（商城兑换等）→ 用户自己的「社区个体」等级折扣；
 *  - 代企业消费（代企业预约空间）→ 所代表企业的「社区企业」等级折扣；
 *  - 无对应身份/等级行/等级未配置折扣 → 原价（10）。 */

export const FULL_PRICE_DISCOUNT = 10

type Db = Prisma.TransactionClient

/** 折扣 → 十分位整数（10 = 1 折 … 100 = 原价）；非法/越界一律按原价（100） */
export function discountTenths(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100
  const tenths = Math.round(value * 10)
  return tenths >= 10 && tenths <= 100 ? tenths : 100
}

/** 折扣归一：保留一位小数；非法/越界按原价（10） */
export function normalizeDiscount(value: number | null | undefined): number {
  return discountTenths(value) / 10
}

/** 折后积分 = round(原价 × 折扣 ÷ 10)；原价 ≤ 0 返回 0，原价折扣直接返回原价 */
export function discountedPoints(price: number, discount: number | null | undefined): number {
  if (price <= 0) return 0
  const tenths = discountTenths(discount)
  if (tenths === 100) return price
  return Math.round((price * tenths) / 100)
}

/** 折扣文案（无前后缀）：'原价' / '8.5 折' */
export function discountText(discount: number | null | undefined): string {
  const tenths = discountTenths(discount)
  return tenths === 100 ? '原价' : `${tenths / 10} 折`
}

/** 折扣文案（流水/通知后缀）：原价无标注，8.5 折 → '，8.5 折' */
export function discountLabel(discount: number | null | undefined): string {
  return discountTenths(discount) === 100 ? '' : `，${discountText(discount)}`
}

/** 用户「社区个体」等级折扣 */
export async function resolveUserPointsDiscount(db: Db, userId: string): Promise<number> {
  const identity = await db.userIdentity.findFirst({
    where: { userId, type: 'community_individual' },
    select: { level: true },
  })
  if (!identity?.level) return FULL_PRICE_DISCOUNT
  const tier = await db.levelTier.findUnique({
    where: { identityType_level: { identityType: 'community_individual', level: identity.level } },
    select: { pointsDiscount: true },
  })
  return normalizeDiscount(tier?.pointsDiscount)
}

/** 社区企业等级折扣（按企业经验值命中等级，与发布额度主体解析同一口径） */
export async function resolveEnterprisePointsDiscount(db: Db, enterpriseId: string): Promise<number> {
  const enterprise = await db.enterprise.findUnique({ where: { id: enterpriseId }, select: { experience: true } })
  if (!enterprise) return FULL_PRICE_DISCOUNT
  const tiers = await db.levelTier.findMany({
    where: { identityType: 'community_enterprise' },
    orderBy: { threshold: 'desc' },
  })
  const tier = tiers.find((item) => item.threshold <= enterprise.experience)
  return normalizeDiscount(tier?.pointsDiscount)
}