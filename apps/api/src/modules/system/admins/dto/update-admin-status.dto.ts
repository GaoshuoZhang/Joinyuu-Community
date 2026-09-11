import { IsIn } from 'class-validator'

/* 管理员启停 */
export class UpdateAdminStatusDto {
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled'
}
