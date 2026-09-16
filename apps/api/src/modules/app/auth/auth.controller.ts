import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common'
import { Public } from '../../../common/decorators/public.decorator'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AuthService, type AppLoginResult } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { AppLoginDto } from './dto/login.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { ChangePhoneDto } from '../me/dto/change-phone.dto'

@Controller('api/app/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 图形验证码：返回 { captchaId, image(dataURL) }；按客户端 IP 限流 */
  @Public()
  @Get('captcha')
  captcha(@Req() req: AppAuthenticatedRequest): Promise<{ captchaId: string; image: string }> {
    return this.auth.generateCaptcha(req.ip ?? req.socket.remoteAddress ?? '')
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
}
