import { IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../../common/dto/page-query.dto'

/* GET /api/admin/trash 查询参数（domain 为空表示全部业务域） */
export class QueryTrashDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  domain?: string

  @IsOptional()
  @IsString()
  keyword?: string
}
