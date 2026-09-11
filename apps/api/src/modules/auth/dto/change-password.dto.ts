import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator'

/* 修改密码：新密码至少 8 位且包含字母与数字 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '请输入原密码' })
  oldPassword!: string

  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '新密码需同时包含字母与数字' })
  newPassword!: string
}
