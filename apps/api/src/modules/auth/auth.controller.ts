import { Body, Controller, Get, HttpCode, Param, Post, Req, UnauthorizedException } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { parseDevice } from '../../common/utils/device'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { AuthService, type LoginResult } from './auth.service'
import { AdminSessionService, type AdminSessionDto } from './admin-session.service'
import { LoginDto } from './dto/login.dto'
import { ChangePasswordDto } from './dto/change-password.dto'

@Controller('api/admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: AdminSessionService,
  ) {}

  /** 图形验证码：返回 { captchaId, image(dataURL) } */
  @Public()
  @Get('captcha')
  captcha(): Promise<{ captchaId: string; image: string }> {
    return this.auth.generateCaptcha()
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest): Promise<LoginResult> {
    return this.auth.login(dto.username, dto.password, {
      ip: req.ip ?? '',
      device: parseDevice(req.headers['user-agent'] ?? ''),
      captchaId: dto.captchaId,
      captchaCode: dto.captchaCode,
    })
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return this.auth.logout(payload)
  }

  /** 修改密码：成功后当前账号全部会话强制下线 */
  @HttpCode(200)
  @Post('change-password')
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return this.auth.changePassword(payload.sub, dto.oldPassword, dto.newPassword)
  }

  /** 在线会话列表：会话含 IP/设备等敏感信息，仅会话管理权限可见 */
  @RequirePermission('/system/sessions')
  @Get('sessions')
  listSessions(): Promise<AdminSessionDto[]> {
    return this.sessions.list()
  }

  /** 强制下线：黑名单 jti + 移出会话索引 */
  @RequirePermission('/system/sessions')
  @HttpCode(200)
  @Post('sessions/:jti/kick')
  kickSession(@Param('jti') jti: string): Promise<{ code: number }> {
    return this.sessions.kick(jti)
  }
}
