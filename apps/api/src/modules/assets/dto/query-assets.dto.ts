import { IsOptional, IsString } from 'class-validator'

/* GET /api/admin/assets 查询参数 */
export class QueryAssetsDto {
  @IsOptional()
  @IsString()
  bizType?: string
}
