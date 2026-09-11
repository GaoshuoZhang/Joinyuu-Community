import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator'

/* 文章新增/编辑载荷（对照 apps/admin/src/api/contents.ts ArticlePayload）
 * - channel：official 社区自行发布（新增即待发布）/ submitted 用户投稿（新增即待审核）
 * - columnIds：栏目单选，契约仍以数组承载（取首项）
 * - authorId/authorName：作者可选（资讯发布可空，由后端按 ID 解析名称与身份快照） */
export class ArticlePayloadDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  columnIds!: string[]

  @IsOptional()
  @IsString()
  authorId?: string

  @IsOptional()
  @IsString()
  authorName?: string

  @IsString()
  @IsNotEmpty()
  summary!: string

  @IsString()
  content!: string

  @IsArray()
  @IsString({ each: true })
  tags!: string[]

  @IsOptional()
  @IsIn(['official', 'submitted'])
  channel?: 'official' | 'submitted'
}
