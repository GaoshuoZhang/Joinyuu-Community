import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/demands 查询参数（与列表筛选/排序口径一致）
 * 排序：默认 createdAt 倒序（最新在前）；publishedAt 空值排最后；id 按编号数值比较 */
export class QueryDemandsDto {
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
  @IsString()
  category?: string

  @IsOptional()
  @IsIn(['task', 'investment', 'cooperation'])
  demandType?: string

  @IsOptional()
  @IsIn(['pending', 'pending_release', 'scheduled', 'published', 'rejected', 'projected', 'closed'])
  status?: string

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
