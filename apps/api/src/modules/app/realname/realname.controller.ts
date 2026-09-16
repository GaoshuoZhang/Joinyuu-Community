import { Body, Controller, Get, Put, Req, UnauthorizedException } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppRealnameService } from './realname.service'
import { UpdateRealnameDto } from './dto/update-realname.dto'

@Controller('api/app/me')
export class AppRealnameController {
  constructor(private readonly realname: AppRealnameService) {}

  /** 实名状态（姓名/证件号脱敏展示） */
  @Get('realname')
  status(@Req() req: AppAuthenticatedRequest) {
    return this.realname.status(this.uid(req))
  }

  /** 提交实名认证（姓名 2-20 字 + 18 位身份证校验码校验） */
  @Put('realname')
  verify(@Req() req: AppAuthenticatedRequest, @Body() dto: UpdateRealnameDto) {
    return this.realname.verify(this.uid(req), dto)
  }

  /** 实名分级权益（未实名/已实名两条静态分级） */
  @Get('realname-rights')
  rights(@Req() req: AppAuthenticatedRequest) {
    return this.realname.rights(this.uid(req))
  }

  /** 从请求中取当前用户 uid（AppJwtGuard 注入 request.user） */
  private uid(req: AppAuthenticatedRequest): string {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return payload.sub
  }
}
