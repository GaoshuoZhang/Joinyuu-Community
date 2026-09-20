import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../../common/dto/page-query.dto'

/* GET /api/admin/login-logs 查询参数 */
export class QueryLoginLogsDto extends PageQueryDto {

  @IsOptional()
  @IsIn(['success', 'failed', 'locked'])
  status?: string

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  startDate?: string

  @IsOptional()
  @IsString()
  endDate?: string
}
