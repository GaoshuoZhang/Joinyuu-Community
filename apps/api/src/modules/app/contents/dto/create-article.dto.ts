import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator'

/** 投稿 / 修改重提共用的入参（客户端 ArticleCreatePayload + contract 字段并集）：
 * - columnCode（客户端）与 columnId（底账）二者取一
 * - cover / coverUrl 封面、tags 标签、asIdentity/asEnterpriseId 主体 */
export class CreateArticleDto {
  @IsString()
  @MaxLength(128, { message: '标题过长' })
  title!: string

  @IsOptional()
  @IsString()
  columnId?: string

  @IsOptional()
  @IsString()
  columnCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '摘要过长' })
  summary?: string

  @IsOptional()
  @IsString()
  content?: string

  @IsOptional()
  @IsArray()
  tags?: string[]

  @IsOptional()
  @IsString()
  cover?: string

  @IsOptional()
  @IsString()
  coverUrl?: string

  @IsOptional()
  @IsString()
  asIdentity?: string

  @IsOptional()
  @IsString()
  asEnterpriseId?: string
}