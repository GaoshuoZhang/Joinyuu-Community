import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

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

  @IsOptional()
  @IsIn(['pending', 'pending_release', 'scheduled', 'published', 'selected', 'rejected', 'projected', 'closed'])
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
