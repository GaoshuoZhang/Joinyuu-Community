import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/mall/goods 查询参数（wiki-backend.md §7.10）：
 * keyword 匹配名称/ID；排序字段 id（默认）/points/createdAt，descend 默认（最新在前） */
export class QueryGoodsDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsIn(['on', 'off', 'restock'])
  status?: 'on' | 'off' | 'restock'

  @IsOptional()
  @IsIn(['id', 'points', 'createdAt'])
  sortBy?: 'id' | 'points' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
