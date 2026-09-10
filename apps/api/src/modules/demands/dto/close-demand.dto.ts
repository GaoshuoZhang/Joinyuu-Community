import { IsIn } from 'class-validator'

/* PATCH /api/admin/demands/:id/status 入参：仅支持 closed（关闭需求） */
export class CloseDemandDto {
  @IsIn(['closed'])
  status!: 'closed'
}
