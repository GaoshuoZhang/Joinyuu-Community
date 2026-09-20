import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* 活动列表查询（wiki-backend.md §7.8）：keyword 匹配标题/ID；participant 按报名人筛选 */
export class QueryEventsDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  type?: string

  @IsOptional()
  @IsIn(['pending_release', 'scheduled', 'published', 'ended', 'cancelled'])
  status?: string

  @IsOptional()
  @IsString()
  participant?: string

  @IsOptional()
  @IsIn(['id', 'startTime', 'createdAt'])
  sortBy?: 'id' | 'startTime' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
