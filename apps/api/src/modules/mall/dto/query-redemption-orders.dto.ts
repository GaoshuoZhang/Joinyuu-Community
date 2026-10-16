import { IsArray, IsIn, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

const REDEMPTION_STATUSES = ['pending_use', 'finished', 'cancelled'] as const

/* GET /api/admin/mall/redemption-orders 查询参数（统一券码兑换三态）：
 * keyword 匹配用户名/商品名/订单ID/券码；排序字段 id（默认）/createdAt，descend 默认（最新在前） */
export class QueryRedemptionOrdersDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  /* 状态的多值查询：同时兼容单值（旧调用）与重复查询参数（?status=a&status=b）。
   * 空串是前端勾选式筛选「全不选」的占位（保证该字段在 URL 中可往返），归一后视为未过滤 */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined
    const list = (Array.isArray(value) ? value : [value]).map((v) => String(v)).filter((v) => v !== '')
    return list.length ? list : undefined
  })
  @IsArray()
  @IsIn([...REDEMPTION_STATUSES], { each: true })
  status?: string[]

  @IsOptional()
  @IsIn(['id', 'createdAt'])
  sortBy?: 'id' | 'createdAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
