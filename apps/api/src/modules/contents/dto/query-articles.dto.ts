import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/contents/articles 查询参数（keyword 匹配标题/作者/编号；sortBy 默认 id） */
export class QueryArticlesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize!: number

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  columnId?: string

  @IsOptional()
  @IsIn(['official', 'submitted'])
  channel?: 'official' | 'submitted'

  @IsOptional()
  @IsIn(['pending', 'rejected', 'pending_release', 'scheduled', 'published'])
  status?: string

  @IsOptional()
  @IsIn(['id', 'views', 'createdAt'])
  sortBy?: 'id' | 'views' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
