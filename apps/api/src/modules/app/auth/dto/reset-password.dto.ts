import { IsNotEmpty, IsString, Matches } from 'class-validator'

/** 找回密码（手机号 + 图形验证码降级实现短信；短信通道接入后替换 captcha） */
export class ResetPasswordDto {
  @IsNotEmpty({ message: '请输入手机号' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string

  @IsNotEmpty({ message: '请先获取验证码' })
  @IsString()
  captchaId!: string

  @IsNotEmpty({ message: '请输入验证码' })
  @IsString()
  captchaCode!: string

  @IsNotEmpty({ message: '请输入新密码' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: '密码至少 8 位且包含字母与数字' })
  newPassword!: string
}
