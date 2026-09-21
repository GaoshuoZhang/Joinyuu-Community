import { IsBoolean, IsEmail, IsIn, IsOptional, Matches } from 'class-validator'

/** 移动端注册（认证 + 默认 individual 身份 + 协议同意留痕）。
 * 默认邮箱注册；后台已配置可用短信渠道时可选手机号注册。
 * 无论何种渠道都必须通过验证码验证，验证后的邮箱/手机号即成为可信通知渠道。
 * 昵称与用户名均由服务端自动分配，注册时不填写。 */
export class RegisterDto {
  /** 注册渠道：email（默认）| phone */
  @IsOptional()
  @IsIn(['email', 'phone'], { message: '注册方式不合法' })
  channel?: 'email' | 'phone'

  /** 邮箱（channel=email 时必填） */
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string

  /** 手机号（channel=phone 时必填） */
  @IsOptional()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone?: string

  /** 6 位验证码：邮箱注册为邮箱验证码，手机号注册为短信验证码 */
  @Matches(/^\d{6}$/, { message: '验证码格式不正确' })
  code!: string

  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: '密码至少 8 位且包含字母与数字' })
  password!: string

  /** 须勾选同意用户协议与隐私政策 */
  @IsBoolean({ message: '请先阅读并同意用户协议与隐私政策' })
  agreed!: boolean

  @IsOptional()
  @IsIn(['male', 'female', 'unknown', '男', '女', '保密'])
  gender?: string
}
