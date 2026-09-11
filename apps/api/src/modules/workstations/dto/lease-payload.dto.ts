import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* 租约新增载荷（对照 apps/admin/src/api/workstations.ts LeasePayload） */
export class LeasePayloadDto {
  @IsString()
  enterpriseId!: string

  @IsString()
  enterpriseName!: string

  @IsString()
  @IsIn(['enterprise', 'individual', 'custom'])
  renterType!: string

  @IsArray()
  @IsString({ each: true })
  workstationIds!: string[]

  @IsString()
  startDate!: string

  @IsString()
  endDate!: string

  @IsBoolean()
  longTerm!: boolean

  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyRent!: number

  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  rentPeriod?: string

  @IsString()
  contactName!: string

  @IsString()
  contactPhone!: string
}
