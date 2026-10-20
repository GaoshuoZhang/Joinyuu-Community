import { IsBoolean, IsIn, IsNotEmpty, IsString, Matches } from 'class-validator'

/** POST /api/app/auth/login-by-code — 验证码登录或注册（统一入口第二屏）。
 * 服务端在验证码校验通过后才判定「登录 / 建号」，因此无需（也不允许）先查询账号是否存在：
 * 协议勾选对所有情况统一要求，避免「该手机号/邮箱是否已注册」的账号枚举。
 * deviceId 不在此接收：设备维度频控由 /auth/sms/send、/auth/email/send 承担。 */
export class LoginByCodeDto {
  /** 验证渠道：phone（短信）| email（邮箱） */
  @IsIn(['phone', 'email'], { message: '验证方式不合法' })
  channel!: 'phone' | 'email'

  /** 账号标识：channel=phone 时为手机号，channel=email 时为邮箱 */
  @IsNotEmpty({ message: '请输入手机号/邮箱' })
  @IsString()
  account!: string

  /** 6 位验证码（由对应渠道下发，purpose=login） */
  @Matches(/^\d{6}$/, { message: '验证码格式不正确' })
  code!: string

  /** 须勾选同意用户协议与隐私政策：验证成功若为未注册标识将直接建号，无法区分登录/建号故统一要求 */
  @IsBoolean({ message: '请先阅读并同意用户协议与隐私政策' })
  agreed!: boolean
}
