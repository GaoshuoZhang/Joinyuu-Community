import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'

/** 申请提交 / 修改重提共用入参（schema 驱动字段 + 身份绑定）：
 * - fields：key → string | number | 附件数组（{key,name,size,type,url}）
 * - identity：identity 类型绑定时传 identityType（community_individual / community_enterprise）
 * - organizationName / note：兼容旧字段 */
export class CreateApplicationDto {
  @IsString()
  type!: string

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>

  @IsOptional()
  @IsString()
  identityType?: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  organizationName?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string
}