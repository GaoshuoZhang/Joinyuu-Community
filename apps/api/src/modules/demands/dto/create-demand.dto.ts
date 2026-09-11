import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* POST /api/admin/demands 入参（DemandCreatePayload）
 * publisherIdentity 为提交身份快照（Json 透传），仅 custom 时使用；
 * individual/enterprise 由服务端 resolvePublisherIdentity 重解析，忽略客户端传入值 */
export class CreateDemandDto {
  @IsString()
  publisherId!: string

  @IsOptional()
  @IsString()
  publisherName?: string

  @IsIn(['individual', 'enterprise', 'custom'])
  publisherType!: 'individual' | 'enterprise' | 'custom'

  @IsOptional()
  publisherIdentity?: Record<string, unknown> | null

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

  @IsOptional()
  @IsString()
  scheduledAt?: string
}
