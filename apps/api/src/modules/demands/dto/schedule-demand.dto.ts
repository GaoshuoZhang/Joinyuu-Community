import { IsString } from 'class-validator'

/* POST /api/admin/demands/:id/schedule 入参：定时发布时间（YYYY-MM-DD HH:mm） */
export class ScheduleDemandDto {
  @IsString()
  scheduledAt!: string
}
