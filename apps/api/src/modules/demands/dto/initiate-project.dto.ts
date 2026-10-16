import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator'

export class UndertakerInputDto {
  @IsIn(['enterprise', 'individual', 'custom'])
  type!: 'enterprise' | 'individual' | 'custom'

  @IsString()
  id!: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  share!: number

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  phone?: string
}

export class MilestoneInputDto {
  @IsString()
  name!: string

  @IsString()
  date!: string

  @IsArray()
  @IsString({ each: true })
  owners!: string[]
}

/* POST /api/admin/demands/:id/initiate-project 入参（ProjectInitPayload）
 * 复用 ProjectsService.createProject 校验（承接方≥1、share 合计 100、custom 联系电话） */
export class InitiateProjectDto {
  @IsString()
  projectName!: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UndertakerInputDto)
  undertakers!: UndertakerInputDto[]

  @IsOptional()
  @IsString()
  startDate?: string

  @IsOptional()
  @IsString()
  endDate?: string

  @IsString()
  description!: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneInputDto)
  milestones!: MilestoneInputDto[]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expReward?: number

  /* 「选定承接方」前置步骤勾选的响应记录 ID（社区人员创建的需求由管理员代需求方选定）：
   * 立项事务内把这些响应置为已选定并随后收敛为「已承接」；不传 = 仅按承接方名单立项 */
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  respondentIds?: number[]
}
