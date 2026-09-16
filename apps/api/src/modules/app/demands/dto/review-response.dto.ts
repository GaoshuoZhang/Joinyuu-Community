import { IsIn, IsOptional, IsString } from 'class-validator'

/* POST /me/demands/:id/responses/:responseId/review 入参 */
export class ReviewResponseDto {
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject'

  @IsOptional()
  @IsString()
  rejectReason?: string
}