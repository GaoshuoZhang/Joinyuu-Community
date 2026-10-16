import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator'

/* PUT /api/admin/demands/:id/respondents/:respondentId 入参（编辑响应内容）。
 * 仅可编辑响应方提交的内容字段；响应人姓名 / 所属 / 身份（基本信息）不可编辑。
 * 手机号与邮箱允许传空串表示清空（留空即清除原值）。 */
export class UpdateRespondentDto {
  /** 响应说明（必填，对应 DemandRespondent.message） */
  @IsString()
  @MaxLength(500, { message: '响应说明最多 500 字' })
  message!: string

  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '报价最多 64 字' })
  quote?: string

  @IsOptional()
  @IsString()
  @MaxLength(128, { message: '可投入时间最多 128 字' })
  timeline?: string

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: '相关经验与案例最多 300 字' })
  cases?: string

  @ValidateIf((o) => o.phone !== undefined && o.phone !== '')
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone?: string

  @ValidateIf((o) => o.email !== undefined && o.email !== '')
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: '邮箱格式不正确' })
  email?: string
}
