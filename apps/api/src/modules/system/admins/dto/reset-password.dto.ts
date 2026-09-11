import { IsString, Matches, MinLength } from 'class-validator'

/* 重置管理员密码：至少 8 位且包含字母与数字 */
export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '新密码需同时包含字母与数字' })
  password!: string
}
