import { IsBoolean, IsEmail, IsIn, IsOptional, Matches } from 'class-validator'
import { USERNAME_PATTERN } from '../../../../common/identity/identity-names'

/** 移动端注册（认证 + 默认 individual 身份 + 协议同意留痕）。
 * 默认邮箱注册；后台已配置可用短信渠道时可选手机号注册——两者都必须通过验证码验证，
 * 验证后的邮箱/手机号即成为可信通知渠道。
 * channel='username' 是**兜底**路径（短信与邮箱通道都不可用时）：用户名 + 密码注册，无验证码、
 * 也不产生可信通知渠道，故无法自助找回密码。
 * 昵称始终由服务端自动分配；用户名默认自动分配，username 渠道由用户指定。 */
export class RegisterDto {
  /** 注册渠道：email（默认）| phone | username（双通道不可用时的兜底） */
  @IsOptional()
  @IsIn(['email', 'phone', 'username'], { message: '注册方式不合法' })
  channel?: 'email' | 'phone' | 'username'

  /** 邮箱（channel=email 时必填） */
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string

  /** 手机号（channel=phone 时必填） */
  @IsOptional()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone?: string

  /** 用户名（channel=username 时必填）：格式/保留词/唯一性由服务端判定 */
  @IsOptional()
  @Matches(USERNAME_PATTERN, { message: '用户名需以字母开头，4-20 位，仅可包含字母、数字与下划线' })
  username?: string

  /** 6 位验证码：邮箱注册为邮箱验证码，手机号注册为短信验证码；username 渠道不需要 */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: '验证码格式不正确' })
  code?: string

  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: '密码至少 8 位且包含字母与数字' })
  password!: string

  /** 须勾选同意用户协议与隐私政策 */
  @IsBoolean({ message: '请先阅读并同意用户协议与隐私政策' })
  agreed!: boolean

  @IsOptional()
  @IsIn(['male', 'female', 'unknown', '男', '女', '保密'])
  gender?: string
}
