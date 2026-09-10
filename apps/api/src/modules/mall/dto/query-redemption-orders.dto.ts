import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/mall/redemption-orders 查询参数（wiki-backend.md §7.10）：
 * keyword 匹配用户名/商品名/ID；排序字段 id（默认）/createdAt，descend 默认（最新在前） */
export class QueryRedemptionOrdersDto {
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
  @IsIn(['pending_shipment', 'shipped', 'finished', 'cancelled'])
  status?: 'pending_shipment' | 'shipped' | 'finished' | 'cancelled'

  @IsOptional()
  @IsIn(['id', 'createdAt'])
  sortBy?: 'id' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
