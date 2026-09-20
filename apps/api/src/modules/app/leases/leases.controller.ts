import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppLeasesService } from './leases.service'

@Controller('api/app/me/leases')
export class AppLeasesController {
  constructor(private readonly leases: AppLeasesService) {}

  @Get()
  findMine(@Req() req: AppAuthenticatedRequest) {
    const uid = req.user?.sub
    if (!uid) throw new UnauthorizedException('未登录或登录已过期')
    return this.leases.findMine(uid)
  }
}
