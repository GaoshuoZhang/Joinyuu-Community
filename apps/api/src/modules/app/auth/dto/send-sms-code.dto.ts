import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { SMS_PURPOSES } from '../../../messaging/sms-code.service'

/** POST /api/app/auth/sms/send — 发送短信验证码（注册/找回密码/换绑手机号/登录） */
export class SendSmsCodeDto {
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string

  @IsIn(SMS_PURPOSES, { message: '验证码用途不合法' })
  purpose!: string

  /** 设备标识（可选）：参与设备维度风控 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string
}
