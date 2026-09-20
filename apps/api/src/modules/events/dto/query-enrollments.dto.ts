import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/events/enrollments 查询参数（活动报名审核列表）：
 * keyword 匹配报名人/企业/联系电话/活动标题与编号；eventId 限定单个活动 */
export class QueryEnrollmentsDto {
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
  @IsIn(['pending', 'approved', 'rejected', 'waitlisted', 'cancelled'])
  status?: string

  @IsOptional()
  @IsString()
  eventId?: string
}
