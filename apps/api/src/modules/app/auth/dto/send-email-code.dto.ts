import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { EMAIL_PURPOSES } from '../../../messaging/email-code.service'

/** POST /api/app/auth/email/send — 发送邮箱验证码（注册/找回密码/换绑邮箱） */
export class SendEmailCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string

  @IsIn(EMAIL_PURPOSES, { message: '验证码用途不合法' })
  purpose!: string

  /** 设备标识（可选）：参与设备维度风控 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string
}
