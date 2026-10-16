import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

/** 可见/可预约范围的身份白名单（与需求表单 identity 选项一致） */
const SCOPE_IDENTITIES = ['individual', 'community_individual', 'community_enterprise', 'external_enterprise']
/** 可见/可预约范围的等级白名单：1-10 级（仅社区个体/社区企业持有经验值等级） */
const SCOPE_LEVELS = Array.from({ length: 10 }, (_, i) => String(i + 1))

/* 空间新增/编辑载荷（对照 apps/admin/src/api/spaces.ts SpacePayload） */
export class SpacePayloadDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsString()
  @IsIn(['meeting', 'roadshow', 'meeting_room', 'multi', 'study'])
  type!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number

  @IsString()
  location!: string

  @IsString()
  openTime!: string

  @IsString()
  closeTime!: string

  @IsBoolean()
  allDay!: boolean

  @IsBoolean()
  needReservation!: boolean

  @IsBoolean()
  needApproval!: boolean

  /** 费用（积分/小时）；0 = 免费。缺省按 0 处理（兼容不含该字段的历史载荷） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  feePerHour?: number

  @IsArray()
  @IsString({ each: true })
  equipment!: string[]

  @IsString()
  description!: string

  /** 自定义可见范围：身份列表（空数组 = 不限）。缺省视为不限，兼容不含该字段的历史载荷 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SCOPE_IDENTITIES.length)
  @IsIn(SCOPE_IDENTITIES, { each: true })
  visibilityIdentities?: string[]

  /** 自定义可见范围：等级列表（空数组 = 不限等级） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(SCOPE_LEVELS, { each: true })
  visibilityLevels?: string[]

  /** 自定义可预约范围：身份列表（空数组 = 不限）；提交预约时校验 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SCOPE_IDENTITIES.length)
  @IsIn(SCOPE_IDENTITIES, { each: true })
  reservationIdentities?: string[]

  /** 自定义可预约范围：等级列表（空数组 = 不限等级） */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(SCOPE_LEVELS, { each: true })
  reservationLevels?: string[]
}
