import { IsIn, IsOptional, IsString } from 'class-validator'

/* POST /api/admin/contents/articles/:id/review 入参 { status, comment? }；rejected 必填 comment（业务校验在 Service） */
export class ReviewArticleDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected'

  @IsOptional()
  @IsString()
  comment?: string
}
