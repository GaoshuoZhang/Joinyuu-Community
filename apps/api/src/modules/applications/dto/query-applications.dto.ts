import { IsIn, IsOptional } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

export class QueryApplicationsDto extends PageQueryDto {

  @IsOptional()
  @IsIn(['settle', 'individual', 'cooperation', 'exit'])
  type?: 'settle' | 'individual' | 'cooperation' | 'exit'

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected'
}
