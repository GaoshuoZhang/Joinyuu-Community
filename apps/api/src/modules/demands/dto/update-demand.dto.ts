import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* PUT /api/admin/demands/:id 入参（DemandPublishPayload，编辑不改状态/提交人） */
export class UpdateDemandDto {
  @IsString()
  title!: string

  @IsString()
  category!: string

  @IsOptional()
  @IsIn(['task', 'investment', 'cooperation'])
  demandType?: 'task' | 'investment' | 'cooperation'

  @IsOptional()
  @IsString()
  deliverable?: string

  @IsOptional()
  @IsString()
  deliverBy?: string

  @IsOptional()
  @IsString()
  cooperationNeed?: string

  @IsOptional()
  @IsString()
  returnOffer?: string

  @IsOptional()
  @IsString()
  bottleneck?: string

  @IsOptional()
  @IsString()
  partnershipMode?: string

  @IsString()
  budget!: string

  @IsString()
  period!: string

  @IsString()
  deadline!: string

  @IsString()
  description!: string

  @IsArray()
  @IsString({ each: true })
  visibilityIdentities!: string[]

  @IsArray()
  @IsString({ each: true })
  visibilityLevels!: string[]

  @IsArray()
  @IsString({ each: true })
  enrollmentIdentities!: string[]

  @IsArray()
  @IsString({ each: true })
  enrollmentLevels!: string[]

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  contactPhone?: string

  @IsOptional()
  @IsString()
  contactEmail?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  respondPoints?: number
}
