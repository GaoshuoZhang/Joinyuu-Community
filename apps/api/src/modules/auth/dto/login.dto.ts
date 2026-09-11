import { IsNotEmpty, IsString } from 'class-validator'

export class LoginDto {
  @IsNotEmpty({ message: '请输入用户名' })
  username!: string

  @IsNotEmpty({ message: '请输入密码' })
  password!: string

  /* 图形验证码（必填：服务端强制校验，一次性消费，5 分钟有效） */
  @IsNotEmpty({ message: '请先获取验证码' })
  @IsString()
  captchaId!: string

  @IsNotEmpty({ message: '请输入验证码' })
  @IsString()
  captchaCode!: string
}
