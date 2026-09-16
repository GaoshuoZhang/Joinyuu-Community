import { Body, Controller, Get, HttpCode, Param, Post, Req, UnauthorizedException } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppReportsService } from './reports.service'
import { CreateReportDto } from './dto/create-report.dto'
import { BlockUserDto } from './dto/block-user.dto'

@Controller('api/app')
export class AppReportsController {
  constructor(private readonly reports: AppReportsService) {}

  /** 提交举报（需求/文章/企业/评论/用户；同对象待处理去重） */
  @HttpCode(200)
  @Post('reports')
  createReport(@Req() req: AppAuthenticatedRequest, @Body() dto: CreateReportDto) {
    return this.reports.createReport(this.uid(req), dto)
  }

  /** 我的举报记录（含处理状态，at 倒序） */
  @Get('me/reports')
  myReports(@Req() req: AppAuthenticatedRequest) {
    return this.reports.myReports(this.uid(req))
  }

  /** 屏蔽名单（被屏蔽者 uid + 昵称） */
  @Get('me/blocklist')
  blocklist(@Req() req: AppAuthenticatedRequest) {
    return this.reports.blocklist(this.uid(req))
  }

  /** 屏蔽用户（幂等） */
  @HttpCode(200)
  @Post('me/blocklist')
  block(@Req() req: AppAuthenticatedRequest, @Body() dto: BlockUserDto) {
    return this.reports.block(this.uid(req), dto.uid)
  }

  /** 取消屏蔽（幂等） */
  @HttpCode(200)
  @Post('me/blocklist/:uid/remove')
  unblock(@Req() req: AppAuthenticatedRequest, @Param('uid') targetUid: string) {
    return this.reports.unblock(this.uid(req), targetUid)
  }

  /** 从请求中取当前用户 uid（AppJwtGuard 注入 request.user） */
  private uid(req: AppAuthenticatedRequest): string {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return payload.sub
  }
}
