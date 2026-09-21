import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator'

/** 租赁日期格式（与后台 t-date-picker valueType 及调度比较口径一致） */
const LEASE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
  @Matches(LEASE_DATE_RE, { message: '租赁开始日期格式应为 YYYY-MM-DD' })
  startDate!: string

  /** 长期租约时前端传空串；非空才校验格式，必填与先后关系由服务层兜底校验 */
  @ValidateIf((o: LeasePayloadDto) => !!o.endDate)
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
}
