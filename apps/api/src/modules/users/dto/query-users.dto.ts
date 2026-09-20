import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* GET /api/admin/users 查询参数（与列表筛选口径一致） */
export class QueryUsersDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsIn(['active', 'frozen', 'deleted'])
  status?: string

  /* 身份筛选：individual=仅持有基础个人身份；其余为持该类型身份 */
  @IsOptional()
  @IsIn(['individual', 'community_individual', 'community_enterprise', 'external_enterprise'])
  category?: string

  /* 实名状态派生：verified=真实姓名+身份证号齐全 */
  @IsOptional()
  @IsIn(['verified', 'unverified'])
  realStatus?: string
}
