import { IsNotEmpty, IsString, Matches } from 'class-validator'

/** 更换绑定手机号（新号图形验证码；短信通道接入后替换 captcha） */
export class ChangePhoneDto {
  @IsNotEmpty({ message: '请输入新手机号' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  newPhone!: string

  @IsNotEmpty({ message: '请先获取验证码' })
  @IsString()
  captchaId!: string

  @IsNotEmpty({ message: '请输入验证码' })
  @IsString()
  captchaCode!: string
}