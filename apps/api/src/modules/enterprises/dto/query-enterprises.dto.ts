import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/enterprises 查询参数（keyword 匹配名称/ID） */
export class QueryEnterprisesDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  industry?: string

  @IsOptional()
  @IsIn(['active', 'pending', 'exited', 'disabled'])
  status?: string
}
