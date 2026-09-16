import { IsString } from 'class-validator'

/* POST /me/projects/:id/milestones/:milestoneId/return 入参（退回原因必填） */
export class ReturnMilestoneDto {
  @IsString()
  reason!: string
}