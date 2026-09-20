import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/external-enterprises 查询参数
 * 排序：默认 registeredAt 倒序（登记日期新在前）；registeredAt 为 YYYY-MM-DD */
export class QueryExternalEnterprisesDto {
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
