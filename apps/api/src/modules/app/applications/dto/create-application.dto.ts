import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'

/** 申请提交 / 修改重提共用入参（schema 驱动字段）：
 * - fields：key → string | number | 附件数组（{key,name,size,type,url}）
 * - note：兼容旧字段 */
export class CreateApplicationDto {
  @IsString()
  type!: string

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>

  @IsOptional()
  @IsString()

  @IsOptional()
  @IsString()
  @MaxLength(128)

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string
}