import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/audit-logs 查询参数（module 精确筛选 + keyword 跨 target/action/detail/operator 模糊） */
export class QueryAuditLogsDto {
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
  module?: string
}
