import { IsIn } from 'class-validator'

export class ReviewEnrollmentDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected'
}
