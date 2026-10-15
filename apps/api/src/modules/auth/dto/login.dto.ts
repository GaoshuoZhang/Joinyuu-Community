import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class LoginDto {
  @IsNotEmpty({ message: '请输入用户名' })
  username!: string

  @IsNotEmpty({ message: '请输入密码' })
  password!: string

  /* 第三次连续密码错误后由服务端要求图形验证码 */
  @IsOptional()
  @IsString()
  captchaId?: string

  @IsOptional()
  @IsString()
  captchaCode?: string
}
