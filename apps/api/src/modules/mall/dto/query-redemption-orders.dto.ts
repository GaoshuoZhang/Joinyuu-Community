import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/mall/redemption-orders 查询参数（统一券码兑换三态）：
 * keyword 匹配用户名/商品名/订单ID/券码；排序字段 id（默认）/createdAt，descend 默认（最新在前） */
export class QueryRedemptionOrdersDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsIn(['pending_use', 'finished', 'cancelled'])
  status?: 'pending_use' | 'finished' | 'cancelled'

  @IsOptional()
  @IsIn(['id', 'createdAt'])
  sortBy?: 'id' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
