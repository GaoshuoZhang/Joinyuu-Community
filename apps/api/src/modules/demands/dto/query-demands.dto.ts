import { IsArray, IsIn, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

const DEMAND_STATUSES = ['pending', 'pending_release', 'scheduled', 'published', 'selected', 'rejected', 'projected', 'closed'] as const

/* GET /api/admin/demands 查询参数（与列表筛选/排序口径一致）
 * 排序：默认 createdAt 倒序（最新在前）；publishedAt 空值排最后；id 按编号数值比较 */
export class QueryDemandsDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsIn(['task', 'investment', 'cooperation'])
  demandType?: string

  /* 状态的多值查询：同时兼容单值（旧调用）与重复查询参数（?status=a&status=b）。
   * 空串是前端勾选式筛选「全不选」的占位（保证该字段在 URL 中可往返），归一后视为未过滤 */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined
    const list = (Array.isArray(value) ? value : [value]).map((v) => String(v)).filter((v) => v !== '')
    return list.length ? list : undefined
  })
  @IsArray()
  @IsIn([...DEMAND_STATUSES], { each: true })
  status?: string[]

  @IsOptional()
  @IsString()
  publisherId?: string

  @IsOptional()
  @IsString()
  enterprise?: string

  @IsOptional()
  @IsIn(['createdAt', 'publishedAt', 'id'])
  sortBy?: 'createdAt' | 'publishedAt' | 'id'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
