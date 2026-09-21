import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator'

/** 租赁日期格式（与后台 t-date-picker valueType 及调度比较口径一致） */
const LEASE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/* 租约续期/改租金/改联系人载荷（对照 apps/admin/src/api/workstations.ts LeaseUpdatePayload） */
export class LeaseUpdateDto {
  @IsString()
  @Matches(LEASE_DATE_RE, { message: '租赁开始日期格式应为 YYYY-MM-DD' })
  startDate!: string

  /** 长期租约时前端传空串；非空才校验格式，必填与先后关系由服务层兜底校验 */
  @ValidateIf((o: LeaseUpdateDto) => !!o.endDate)
  @IsString()
  @Matches(LEASE_DATE_RE, { message: '租赁结束日期格式应为 YYYY-MM-DD' })
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
