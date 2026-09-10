import { Type } from 'class-transformer'
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator'
import type { MilestoneInput, UndertakerInput } from '../projects.service'

/* 创建/编辑项目 Payload（ProjectInitPayload，wiki-backend.md §7.7 / apps/admin/src/types/index.ts）
 * 业务规则（承接方非空、share 合计 100、承接方名称解析）在 Service 校验（错误文案与 M0 一致） */
export class CreateProjectDto {
  @IsString()
  projectName!: string

  @IsArray()
  undertakers!: UndertakerInput[]

  @IsOptional()
  @IsString()
  startDate?: string

  @IsOptional()
  @IsString()
  endDate?: string

  @IsString()
  description!: string

  @IsArray()
  milestones!: MilestoneInput[]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expReward?: number
}
