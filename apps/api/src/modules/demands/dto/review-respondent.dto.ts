import { IsIn, IsString, MaxLength, ValidateIf } from 'class-validator'

/* POST /api/admin/demands/:id/respondents/:respondentId/review 入参（需求响应审核） */
export class ReviewRespondentDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected'

  /* 驳回时必填：随站内通知下发给响应者，并记入审计日志 */
  @ValidateIf((o) => o.status === 'rejected')
  @IsString()
  @MaxLength(200)
  reason?: string
}