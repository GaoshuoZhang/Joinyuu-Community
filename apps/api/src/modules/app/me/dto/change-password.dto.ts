import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'

/** 登录态设置/修改密码。
 * 已有密码的账号必须校验原密码；「未设置密码」账号（passwordHash 为空，如验证码建号）首次设置时
 * 不需要原密码，故 oldPassword 为可选，由服务层按账号实际状态判定。 */
export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  oldPassword?: string

  @IsNotEmpty({ message: '请输入新密码' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: '密码至少 8 位且包含字母与数字' })
  newPassword!: string
}
