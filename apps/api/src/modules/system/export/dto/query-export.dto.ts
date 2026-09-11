import { IsOptional, IsString } from 'class-validator'

/* GET /api/admin/export/:domain 查询参数（按域支持 keyword/status/时间范围） */
export class QueryExportDto {
  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  status?: string

  @IsOptional()
  @IsString()
  startDate?: string

  @IsOptional()
  @IsString()
  endDate?: string
}
