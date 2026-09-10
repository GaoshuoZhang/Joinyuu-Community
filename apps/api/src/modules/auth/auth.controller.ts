import { Body, Controller, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'

@Controller('api/admin/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest): Promise<{ token: string; name: string }> {
    return this.auth.login(dto.username, dto.password, req.ip ?? '')
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return this.auth.logout(payload)
  }
}
