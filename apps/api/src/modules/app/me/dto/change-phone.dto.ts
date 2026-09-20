import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'

/** 更换绑定手机号（新号图形验证码与短信验证码二选一；短信通道启用后优先短信码） */
export class ChangePhoneDto {
  @IsNotEmpty({ message: '请输入新手机号' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  newPhone!: string

  @IsOptional()
  @IsString()
  captchaId?: string

  @IsOptional()
  @IsString()
  captchaCode?: string

  /** 短信验证码（用途 change_phone）；与图形验证码二选一 */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: '短信验证码格式不正确' })
  smsCode?: string
}