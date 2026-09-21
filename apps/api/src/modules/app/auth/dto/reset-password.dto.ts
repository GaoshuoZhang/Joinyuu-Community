import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/** 找回密码：必须使用「可信通知渠道」验证——账号已验证的邮箱或手机号接收验证码。 */
export class ResetPasswordDto {
  /** 账号标识：手机号 / 邮箱 / 用户名 */
  @IsNotEmpty({ message: '请输入手机号/邮箱/用户名' })
  @IsString()
  identifier!: string

  /** 验证渠道：email | phone（须为该账号已验证的可信渠道） */
  @IsIn(['email', 'phone'], { message: '验证方式不合法' })
  channel!: 'email' | 'phone'

  @Matches(/^\d{6}$/, { message: '验证码格式不正确' })
  code!: string

  @IsNotEmpty({ message: '请输入新密码' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: '密码至少 8 位且包含字母与数字' })
  newPassword!: string
}

/** 找回密码发码：由服务端解析账号的「可信渠道」并向其真实地址发码（客户端无需、也拿不到真实地址） */
export class SendResetCodeDto {
  /** 账号标识：手机号 / 邮箱 / 用户名 */
  @IsNotEmpty({ message: '请输入手机号/邮箱/用户名' })
  @IsString()
  identifier!: string

  /** 验证渠道：email | phone（须为该账号已验证的可信渠道） */
  @IsIn(['email', 'phone'], { message: '验证方式不合法' })
  channel!: 'email' | 'phone'

  /** 设备标识（可选）：参与设备维度风控 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string
}
