import { IsArray, IsIn, IsOptional } from 'class-validator'

/* PUT /api/admin/rules/levels 入参（wiki-backend.md §7.11）：整组保存
 * { tiers: [{ level, label, threshold, pointsDiscount?, demandPublishLimit?, articleSubmitLimit? }] }
 * 业务规则（1-10 级、标签非空、门槛非负整数且逐级递增、折扣 1-10、额度 -1/0..10000）在 Service 校验
 * （错误文案固定），数组项仅做结构约束（对照 create-project.dto.ts 的嵌套数组做法） */
export interface LevelTierInput {
  level?: number
  label?: string
  threshold?: number
  /** 积分消费折扣：1 = 1 折 … 10 = 原价（最多一位小数，如 8.5 = 85 折）；缺省按原价（10） */
  pointsDiscount?: number
  /** 该等级每日需求发布额度（-1 不限 / 0 禁止 / 正整数）；缺省保持既有额度 */
  demandPublishLimit?: number
  /** 该等级每日文章投稿额度；缺省保持既有额度 */
  articleSubmitLimit?: number
}

export class SaveLevelTiersDto {
  @IsOptional()
  @IsIn(['community_individual', 'community_enterprise'])
  identityType?: 'community_individual' | 'community_enterprise'

  @IsArray()
  tiers!: LevelTierInput[]
}
