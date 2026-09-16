import { IsIn, IsNotEmpty, IsOptional, MaxLength } from 'class-validator'

/** 举报对象类型（需求/文章/企业/评论/用户） */
export const REPORT_TARGET_TYPES = ['demand', 'article', 'enterprise', 'comment', 'user']

/** 提交举报（同一举报人对同一对象的待处理举报去重） */
export class CreateReportDto {
  @IsIn(REPORT_TARGET_TYPES, { message: '举报对象类型不正确' })
  targetType!: string

  @IsNotEmpty({ message: '举报对象不能为空' })
  targetId!: string

  @IsNotEmpty({ message: '举报对象标题不能为空' })
  @MaxLength(128, { message: '举报对象标题不能超过 128 字' })
  targetTitle!: string

  @IsNotEmpty({ message: '请选择举报原因' })
  @MaxLength(64, { message: '举报原因不能超过 64 字' })
  reason!: string

  @IsOptional()
  @MaxLength(500, { message: '补充说明不能超过 500 字' })
  detail?: string
}
