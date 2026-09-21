import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator'

/** 绑定/更换绑定邮箱：须验证新邮箱（邮箱验证码） */
export class ChangeEmailDto {
  @IsNotEmpty({ message: '请输入新邮箱' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  newEmail!: string

  /** 邮箱验证码（用途 change_email） */
  @Matches(/^\d{6}$/, { message: '验证码格式不正确' })
  code!: string
}

/** 找回密码前置：按账号标识查询可用的可信验证渠道 */
export class RecoveryChannelsQueryDto {
  @IsNotEmpty({ message: '请输入手机号/邮箱/用户名' })
  @IsString()
  identifier!: string
}
