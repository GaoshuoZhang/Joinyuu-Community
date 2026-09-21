import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator'

/* POST /api/admin/users/:id/freeze 入参：
 * permanent=true 长期冻结（不写 frozenUntil），否则需冻结期限 until；reason 必填（业务校验在 Service，文案固定）。
 * until 与后台 t-date-picker 口径一致（YYYY-MM-DD HH:mm），兼容仅日期（服务层按当日 23:59 处理）。 */
const FREEZE_UNTIL_RE = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/

export class FreezeUserDto {
  @IsOptional()
  @IsString()
  @Matches(FREEZE_UNTIL_RE, { message: '冻结期限格式应为 YYYY-MM-DD HH:mm' })
  until?: string

  @IsBoolean()
  permanent!: boolean

  @IsOptional()
  @IsString()
  reason?: string
}
