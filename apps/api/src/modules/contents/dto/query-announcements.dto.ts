import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/announcements 查询参数（keyword 匹配标题/编号；置顶优先排序在 Service 内固化） */
export class QueryAnnouncementsDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsIn(['published', 'withdrawn'])
  status?: string
}
