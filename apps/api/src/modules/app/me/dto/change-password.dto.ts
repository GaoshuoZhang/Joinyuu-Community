import { IsNotEmpty, Matches } from 'class-validator'

/** 登录态修改密码（校验原密码） */
export class ChangePasswordDto {
  @IsNotEmpty({ message: '请输入原密码' })
  oldPassword!: string

  @IsNotEmpty({ message: '请输入新密码' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: '密码至少 8 位且包含字母与数字' })
  newPassword!: string
}
