import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/mall/goods 查询参数（wiki-backend.md §7.10）：
 * keyword 匹配名称/ID；排序字段 id（默认）/points/createdAt，descend 默认（最新在前） */
export class QueryGoodsDto {
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
  @IsIn(['physical', 'virtual', 'voucher'])
  category?: 'physical' | 'virtual' | 'voucher'

  @IsOptional()
  @IsIn(['on', 'off'])
  status?: 'on' | 'off'

  @IsOptional()
  @IsIn(['id', 'points', 'createdAt'])
  sortBy?: 'id' | 'points' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
