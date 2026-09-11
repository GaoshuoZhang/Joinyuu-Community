import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/trash 查询参数（domain 为空表示全部业务域） */
export class QueryTrashDto {
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
  domain?: string

  @IsOptional()
  @IsString()
  keyword?: string
}
