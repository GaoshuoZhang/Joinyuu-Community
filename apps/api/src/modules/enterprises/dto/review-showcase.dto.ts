import { IsIn, IsOptional, IsString } from 'class-validator'

/* PATCH /api/admin/enterprises/:id/showcase-status 入参 { status, comment? }；rejected 必填 comment（业务校验在 Service） */
export class ReviewShowcaseDto {
  @IsIn(['pending', 'published', 'rejected'])
  status!: 'pending' | 'published' | 'rejected'

  @IsOptional()
  @IsString()
  comment?: string
}
