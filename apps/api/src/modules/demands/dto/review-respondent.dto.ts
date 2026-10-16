import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator'
import { RESPONDENT_VISIBILITY_FIELDS } from '../../../common/demands/respondent-fields'

/* POST /api/admin/demands/:id/respondents/:respondentId/review 入参（需求响应审核） */
export class ReviewRespondentDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected'

  /* 驳回时必填：随站内通知下发给响应者，并记入审计日志 */
  @ValidateIf((o) => o.status === 'rejected')
  @IsString()
  @MaxLength(200)
  reason?: string

  /* 通过时可选：对需求方隐藏的响应字段（消息键见 common/demands/respondent-fields）；缺省 = 全部显示 */
  @IsOptional()
  @IsArray()
  @IsIn(RESPONDENT_VISIBILITY_FIELDS, { each: true, message: '存在不可隐藏的响应字段' })
  hiddenFields?: string[]
}
