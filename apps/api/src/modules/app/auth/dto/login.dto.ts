import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

/** 移动端登录：手机号 / 邮箱 / 用户名任一 + 密码；连续密码失败三次后需图形验证码 */
export class AppLoginDto {
  /** 登录标识：手机号 / 邮箱 / 用户名 */
  @IsNotEmpty({ message: '请输入手机号/邮箱/用户名' })
  @IsString()
  identifier!: string

  @IsNotEmpty({ message: '请输入密码' })
  password!: string

  @IsOptional()
  @IsString()
  captchaId?: string

  @IsOptional()
  @IsString()
  captchaCode?: string
}
