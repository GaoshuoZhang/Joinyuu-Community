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
 * 复用 ProjectsService.createProject 校验（承接方≥1、share 合计 100、custom 联系方式） */
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
}
