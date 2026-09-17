import { IsArray, IsIn, IsOptional } from 'class-validator'

/* PUT /api/admin/rules/levels 入参（wiki-backend.md §7.11）：整组保存 { tiers: [{ level, label, threshold }] }
 * 业务规则（1-10 级、标签非空、门槛非负整数且逐级递增）在 Service 校验（错误文案固定），
 * 数组项仅做结构约束（对照 create-project.dto.ts 的嵌套数组做法） */
export interface LevelTierInput {
  level?: number
  label?: string
  threshold?: number
}

export class SaveLevelTiersDto {
  @IsOptional()
  @IsIn(['community_individual', 'community_enterprise'])
  identityType?: 'community_individual' | 'community_enterprise'

  @IsArray()
  tiers!: LevelTierInput[]
}
