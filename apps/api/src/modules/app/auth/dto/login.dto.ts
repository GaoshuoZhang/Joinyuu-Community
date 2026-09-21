import { IsNotEmpty, IsString } from 'class-validator'

/** 移动端登录：手机号 / 邮箱 / 用户名 任一 + 密码 + 图形验证码 */
export class AppLoginDto {
  /** 登录标识：手机号 / 邮箱 / 用户名 */
  @IsNotEmpty({ message: '请输入手机号/邮箱/用户名' })
  @IsString()
  identifier!: string

  @IsNotEmpty({ message: '请输入密码' })
  password!: string

  @IsNotEmpty({ message: '请先获取验证码' })
  @IsString()
  captchaId!: string

  @IsNotEmpty({ message: '请输入验证码' })
  @IsString()
  captchaCode!: string
}
