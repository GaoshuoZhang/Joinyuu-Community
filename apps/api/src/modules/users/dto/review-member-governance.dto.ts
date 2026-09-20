import { IsIn, IsString, MaxLength } from 'class-validator'

export class ReviewDeletionDto {
  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject'

  @IsString()
  @MaxLength(255)
  note!: string
}
