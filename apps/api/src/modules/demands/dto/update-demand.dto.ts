import { Type } from 'class-transformer'
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* PUT /api/admin/demands/:id 入参（DemandPublishPayload，编辑不改状态/提交人） */
export class UpdateDemandDto {
  @IsString()
  title!: string

  @IsString()
  category!: string

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
