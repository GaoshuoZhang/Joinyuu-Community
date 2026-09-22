import { IsIn, IsString, MaxLength, ValidateIf } from 'class-validator'

export class ReviewEnrollmentDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected'

  /* 驳回时必填：随站内通知下发给申请人，并记入审计日志 */
  @ValidateIf((o) => o.status === 'rejected')
  @IsString()
  @MaxLength(200)
  reason?: string
}
