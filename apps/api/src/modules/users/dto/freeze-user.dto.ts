import { IsBoolean, IsOptional, IsString } from 'class-validator'

/* POST /api/admin/users/:id/freeze 入参：
 * permanent=true 长期冻结（不写 frozenUntil），否则需冻结期限 until；reason 必填（业务校验在 Service，文案与 M0 一致） */
export class FreezeUserDto {
  @IsOptional()
  @IsString()
  until?: string

  @IsBoolean()
  permanent!: boolean

  @IsOptional()
  @IsString()
  reason?: string
}
