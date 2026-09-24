import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

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
}
