import { IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/demand-responses 查询参数：固定只返回待审核（pending_review）响应，
 * 排序按提交时间倒序（最新在前）。keyword 跨响应者/企业/留言/需求编号模糊匹配；
 * demandId 用于从「需求详情 > 响应记录」跳转时仅看该需求的待审核响应。 */
export class QueryDemandResponsesDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  demandId?: string
}
