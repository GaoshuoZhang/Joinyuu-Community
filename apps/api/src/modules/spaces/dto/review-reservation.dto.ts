import { IsIn, IsOptional, IsString } from 'class-validator'

/* 空间预约审核载荷（对照 apps/admin/src/api/spaces.ts reviewReservation 入参） */
export class ReviewReservationDto {
  @IsString()
  @IsIn(['approved', 'rejected'])
  status!: string

  @IsOptional()
  @IsString()
  comment?: string
}
