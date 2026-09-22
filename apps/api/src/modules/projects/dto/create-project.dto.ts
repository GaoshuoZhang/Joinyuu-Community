import { Type } from 'class-transformer'
import { IsArray, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator'
import type { Prisma } from '@prisma/client'
import type { MilestoneInput, UndertakerInput } from '../projects.service'

/* 新增/编辑项目 Payload（ProjectInitPayload，wiki-backend.md §7.7 / apps/admin/src/types/index.ts）
 * 业务规则（承接方非空、share 合计 100、承接方名称解析）在 Service 校验（错误文案固定）；
 * 需求立项走 POST /api/admin/demands/:id/initiate-project，需求方等字段由服务端按需求快照覆盖。 */
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

  /** 需求方主体 ID（用户 uid / 企业 ID；社区自建项目可选） */
  @IsOptional()
  @IsString()
  demanderId?: string

  @IsOptional()
  @IsString()
  demanderName?: string

  @IsOptional()
  @IsObject()
  demanderIdentity?: Prisma.InputJsonValue | null

  @IsOptional()
  @IsString()
  creatorName?: string

  @IsOptional()
  @IsString()
  creatorId?: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  contactPhone?: string

  @IsOptional()
  @IsString()
  contactEmail?: string

  /** 合同价格（字符串，沿用需求预算的展示口径，如「¥50,000」「面议」） */
  @IsOptional()
  @IsString()
  contractPrice?: string
}
