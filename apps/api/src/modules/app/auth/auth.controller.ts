import { Body, Controller, Get, HttpCode, Post, Query, Req, UnauthorizedException } from '@nestjs/common'
import { Public } from '../../../common/decorators/public.decorator'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AuthService, type AppLoginResult } from './auth.service'
import { SmsCodeService, type SmsPurpose } from '../../messaging/sms-code.service'
import { EmailCodeService, type EmailPurpose } from '../../messaging/email-code.service'
import { RegisterDto } from './dto/register.dto'
import { AppLoginDto } from './dto/login.dto'
import { ResetPasswordDto, SendResetCodeDto } from './dto/reset-password.dto'
import { SendSmsCodeDto } from './dto/send-sms-code.dto'
import { SendEmailCodeDto } from './dto/send-email-code.dto'
import { ChangeEmailDto, RecoveryChannelsQueryDto } from './dto/change-email.dto'
import { ChangePhoneDto } from '../me/dto/change-phone.dto'

@Controller('api/app/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sms: SmsCodeService,
    private readonly emailCodes: EmailCodeService,
  ) {}

  /** 图形验证码：返回 { captchaId, image(dataURL) }；按客户端 IP 限流 */
  @Public()
  @Get('captcha')
  captcha(@Req() req: AppAuthenticatedRequest): Promise<{ captchaId: string; image: string }> {
    return this.auth.generateCaptcha(req.ip ?? req.socket.remoteAddress ?? '')
  }

  /** 短信通道是否可用：客户端据此决定手机号注册/验证入口是否开放 */
  @Public()
  @Get('sms/available')
  async smsAvailable(): Promise<{ available: boolean }> {
    return { available: await this.sms.isAvailable() }
  }

  /** 邮箱通道是否可用：客户端据此决定邮箱注册/验证入口是否开放 */
  @Public()
  @Get('email/available')
  async emailAvailable(): Promise<{ available: boolean }> {
    return { available: await this.emailCodes.isAvailable() }
  }

  /** 发送短信验证码（P0）：手机号/ IP / 设备三维频控；安全类消息强制送达 */
  @Public()
  @HttpCode(200)
  @Post('sms/send')
  sendSmsCode(
    @Req() req: AppAuthenticatedRequest,
    @Body() dto: SendSmsCodeDto,
  ): Promise<{ expiresInSec: number; devCode?: string }> {
    return this.sms.send(dto.phone, dto.purpose as SmsPurpose, {
      ip: req.ip ?? req.socket.remoteAddress ?? '',
      deviceId: dto.deviceId,
    })
  }

  /** 发送邮箱验证码：邮箱/ IP / 设备三维频控；安全类消息强制送达 */
  @Public()
  @HttpCode(200)
  @Post('email/send')
  sendEmailCode(
    @Req() req: AppAuthenticatedRequest,
    @Body() dto: SendEmailCodeDto,
  ): Promise<{ expiresInSec: number; devCode?: string }> {
    return this.emailCodes.send(dto.email, dto.purpose as EmailPurpose, {
      ip: req.ip ?? req.socket.remoteAddress ?? '',
      deviceId: dto.deviceId,
    })
  }

  /** 找回密码前置：查询该账号已验证的可信验证渠道（邮箱/手机号，脱敏） */
  @Public()
  @Get('recovery-channels')
  recoveryChannels(@Query() query: RecoveryChannelsQueryDto): Promise<{ email: string | null; phone: string | null }> {
    return this.auth.recoveryChannels(query.identifier)
  }

  /** 找回密码发码：服务端按账号解析可信渠道并投递验证码（客户端只传账号标识，无需真实收件地址） */
  @Public()
  @HttpCode(200)
  @Post('reset-code/send')
  sendResetCode(
    @Req() req: AppAuthenticatedRequest,
    @Body() dto: SendResetCodeDto,
  ): Promise<{ expiresInSec: number; devCode?: string }> {
    return this.auth.sendResetCode(dto, {
      ip: req.ip ?? req.socket.remoteAddress ?? '',
      deviceId: dto.deviceId,
    })
  }

  @Public()
  @HttpCode(200)
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AppLoginResult> {
    return this.auth.register(dto)
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: AppLoginDto): Promise<AppLoginResult> {
    return this.auth.login(dto)
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Req() req: AppAuthenticatedRequest): Promise<{ code: number }> {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return this.auth.logout(payload)
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ code: number }> {
    return this.auth.resetPassword(dto)
  }

  /** 绑定/更换绑定手机号（须验证新手机号） */
  @HttpCode(200)
  @Post('change-phone')
  changePhone(
    @Req() req: AppAuthenticatedRequest,
    @Body() dto: ChangePhoneDto,
  ): Promise<{ code: number }> {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return this.auth.changePhone(payload.sub, dto)
  }

  /** 绑定/更换绑定邮箱（须验证新邮箱） */
  @HttpCode(200)
  @Post('change-email')
  changeEmail(
    @Req() req: AppAuthenticatedRequest,
    @Body() dto: ChangeEmailDto,
  ): Promise<{ code: number }> {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return this.auth.changeEmail(payload.sub, dto)
  }
}
