import { IsString, MaxLength } from 'class-validator'

/* POST /api/admin/projects/:id/milestones/:milestoneId/return 入参（退回原因必填；
 * 上限对齐 Milestone.returnReason 的 VarChar(255)，避免超长触发 PG 报错） */
export class ReturnMilestoneDto {
  @IsString()
  @MaxLength(255)
  reason!: string
}
