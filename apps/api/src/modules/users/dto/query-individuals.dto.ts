import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

/* GET /api/admin/individuals 查询参数（社区个体 = 持 community_individual 身份的用户） */
export class QueryIndividualsDto {
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
  @IsIn(['active', 'frozen'])
  status?: string
}
