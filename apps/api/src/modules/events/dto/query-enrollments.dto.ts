import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/events/enrollments 查询参数（活动报名审核列表）：
 * keyword 匹配报名人/企业/联系电话/活动标题与编号；eventId 限定单个活动 */
export class QueryEnrollmentsDto extends PageQueryDto {

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
