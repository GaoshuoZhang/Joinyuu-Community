import { IsArray, IsOptional, IsString } from 'class-validator'

/* POST /me/projects/:id/milestones/:milestoneId/submit 入参
 * note 为提交说明（当前 Milestone 无 note 列，暂不持久化，返回占位）；attachments 为上传返回的 key 数组 */
export class SubmitMilestoneDto {
  @IsOptional()
  @IsString()
  note?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[]
}