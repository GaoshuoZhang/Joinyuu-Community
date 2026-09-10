import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Min } from 'class-validator'

/* GET /api/admin/contents/showcase-requests 查询参数 */
export class QueryShowcaseRequestsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize!: number

  @IsOptional()
  @IsIn(['enterprise', 'individual'])
  targetType?: 'enterprise' | 'individual'

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled'])
  status?: string
}
