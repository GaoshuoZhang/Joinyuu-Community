import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/individuals 查询参数（社区个体 = 持 community_individual 身份的用户） */
export class QueryIndividualsDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsIn(['active', 'frozen'])
  status?: string
}
