import { IsNotEmpty, IsString, Matches } from 'class-validator'

/** 移动端登录（手机号 + 密码 + 图形验证码） */
export class AppLoginDto {
  @IsNotEmpty({ message: '请输入手机号' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string

  @IsNotEmpty({ message: '请输入密码' })
  password!: string

  @IsNotEmpty({ message: '请先获取验证码' })
  @IsString()
  captchaId!: string

  @IsNotEmpty({ message: '请输入验证码' })
  @IsString()
  captchaCode!: string
}
