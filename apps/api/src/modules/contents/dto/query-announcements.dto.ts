import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/announcements 查询参数（keyword 匹配标题/编号；置顶优先排序在 Service 内固化） */
export class QueryAnnouncementsDto {
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
  @IsIn(['published', 'withdrawn'])
  status?: string
}
