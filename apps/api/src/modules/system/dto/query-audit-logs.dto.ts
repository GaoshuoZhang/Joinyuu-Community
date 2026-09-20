import { IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/audit-logs 查询参数（module 精确筛选 + keyword 跨 target/action/detail/operator 模糊） */
export class QueryAuditLogsDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  module?: string
}
