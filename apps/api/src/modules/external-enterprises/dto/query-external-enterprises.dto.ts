import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/external-enterprises 查询参数
 * 排序：默认 cooperationCount 倒序（合作最多在前）；firstCooperationAt 按 YYYY-MM 数值比较 */
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
  @IsIn(['cooperationCount', 'firstCooperationAt'])
  sortBy?: 'cooperationCount' | 'firstCooperationAt'

  @IsOptional()
  @IsIn(['ascend', 'descend'])
  sortOrder?: 'ascend' | 'descend'
}
