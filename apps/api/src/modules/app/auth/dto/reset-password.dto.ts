import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'

/** 找回密码（图形验证码与短信验证码二选一；短信通道启用后优先短信码） */
export class ResetPasswordDto {
  @IsNotEmpty({ message: '请输入手机号' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string

  @IsOptional()
  @IsString()
  captchaId?: string

  @IsOptional()
  @IsString()
  captchaCode?: string

  /** 短信验证码（用途 reset_password）；与图形验证码二选一 */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: '短信验证码格式不正确' })
  smsCode?: string

  @IsNotEmpty({ message: '请输入新密码' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: '密码至少 8 位且包含字母与数字' })
  newPassword!: string
}
