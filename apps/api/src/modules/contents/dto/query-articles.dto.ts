import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/contents/articles 查询参数（keyword 匹配标题/作者/编号；sortBy 默认 id） */
export class QueryArticlesDto extends PageQueryDto {

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
  @IsIn(['pending', 'rejected', 'pending_release', 'scheduled', 'published', 'closed'])
  status?: string

  @IsOptional()
  @IsIn(['id', 'views', 'createdAt'])
  sortBy?: 'id' | 'views' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
