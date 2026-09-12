import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

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

  @IsOptional()
  @IsString()
  note?: string

  /* 编辑原因（必填）：续租/改租金等修改须记录原因，便于追溯 */
  @IsString()
  @IsNotEmpty({ message: '请填写编辑原因' })
  reason!: string
}
