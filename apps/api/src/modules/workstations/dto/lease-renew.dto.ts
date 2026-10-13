import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator'

/** 租赁日期格式（与后台 t-date-picker valueType 及调度比较口径一致） */
const LEASE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/* 租约续期载荷（对照 apps/admin/src/api/workstations.ts LeaseRenewPayload）：
 * 仅续期关心的字段——新到期日（须晚于原到期日，服务层兜底校验）、租金（默认沿用）、续期说明（必填留痕）。 */
export class LeaseRenewDto {
  @IsString()
  @Matches(LEASE_DATE_RE, { message: '租赁结束日期格式应为 YYYY-MM-DD' })
  endDate!: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyRent!: number

  @IsString()
  @IsNotEmpty({ message: '请填写续期说明' })
  reason!: string
}