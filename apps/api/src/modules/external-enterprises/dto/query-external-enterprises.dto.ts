import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/external-enterprises 查询参数
 * 排序：默认 registeredAt 倒序（登记日期新在前）；registeredAt 为 YYYY-MM-DD */
export class QueryExternalEnterprisesDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  industry?: string

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string

  @IsOptional()
  @IsIn(['registeredAt'])
  sortBy?: 'registeredAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
