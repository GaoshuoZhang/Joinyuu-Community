import { IsIn, IsOptional, IsString } from 'class-validator'

/* POST /api/admin/contents/showcase-requests/:id/review 入参 { status, comment? } */
export class ReviewShowcaseRequestDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected'

  @IsOptional()
  @IsString()
  comment?: string
}
