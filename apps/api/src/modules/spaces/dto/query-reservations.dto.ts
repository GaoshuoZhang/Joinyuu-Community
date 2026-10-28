import { IsIn, IsOptional, IsString } from 'class-validator'
import { PageQueryDto } from '../../../common/dto/page-query.dto'

/* 空间预约列表查询（对照 apps/admin/src/api/spaces.ts ReservationQuery） */
export class QueryReservationsDto extends PageQueryDto {

  @IsOptional()
  @IsString()
  keyword?: string

  @IsOptional()
  @IsString()
  spaceId?: string

  @IsOptional()
  @IsIn(['pending', 'pending_payment', 'approved', 'using', 'ended', 'rejected', 'cancelled'])
  status?: string

  @IsOptional()
  @IsString()
  date?: string
}
