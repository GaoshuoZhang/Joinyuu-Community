import { IsIn } from 'class-validator'

/* PATCH /api/admin/users/:id/status 入参 { status }；active 时清空冻结信息 */
export class UpdateUserStatusDto {
  @IsIn(['active', 'frozen'])
  status!: 'active' | 'frozen'
}
