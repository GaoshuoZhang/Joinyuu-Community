import { IsArray, IsNotEmpty, IsString } from 'class-validator'

/* 文章创建/编辑载荷（对照 apps/admin/src/api/contents.ts ArticlePayload） */
export class ArticlePayloadDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsString()
  @IsNotEmpty()
  columnId!: string

  @IsString()
  @IsNotEmpty()
  authorId!: string

  @IsString()
  @IsNotEmpty()
  summary!: string

  @IsArray()
  @IsString({ each: true })
  tags!: string[]
}
