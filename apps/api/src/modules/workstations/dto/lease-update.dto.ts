import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* 租约续期/改租金/改联系人载荷（对照 apps/admin/src/api/workstations.ts LeaseUpdatePayload） */
export class LeaseUpdateDto {
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
