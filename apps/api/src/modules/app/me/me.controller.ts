import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Put, Query, Req, Res, UnauthorizedException } from '@nestjs/common'
import type { Response } from 'express'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { MeService } from './me.service'
import { UpdateMeDto } from './dto/update-me.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { DeletionRequestDto } from './dto/deletion-request.dto'

@Controller('api/app/me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** 个人中心聚合：资料 + 身份列表（含经验/等级）+ 积分余额 */
  @Get()
  profile(@Req() req: AppAuthenticatedRequest) {
    return this.me.profile(this.uid(req))
  }

  /** 更新昵称/头像/性别/简介/邮箱。 */
  @Put()
  updateMe(@Req() req: AppAuthenticatedRequest, @Body() dto: UpdateMeDto) {
    return this.me.updateMe(this.uid(req), dto)
  }

  /** 我的积分流水（分页倒序，含 balance） */
  @Get('points-records')
  pointsRecords(@Req() req: AppAuthenticatedRequest, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const p = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)
    const s = Math.min(50, Math.max(1, Number.parseInt(pageSize ?? '10', 10) || 10))
    return this.me.pointsRecords(this.uid(req), p, s)
  }

  /** 我的经验与等级（走社区个体个人维度） */
  @Get('experience-records')
  experienceRecords(@Req() req: AppAuthenticatedRequest, @Query('identity') identity?: string) {
    return this.me.experienceRecords(this.uid(req), identity)
  }

  /** 登录态修改密码 */
  @HttpCode(200)
  @Post('change-password')
  changePassword(@Req() req: AppAuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.me.changePassword(this.uid(req), req.user?.jti ?? '', dto)
  }

  /** 提交账号注销申请（7 天冷静期） */
  @HttpCode(200)
  @Post('deletion-request')
  deletionRequest(@Req() req: AppAuthenticatedRequest, @Body() dto: DeletionRequestDto) {
    return this.me.deletionRequest(this.uid(req), dto)
  }

  /** 撤销注销申请 */
  @HttpCode(200)
  @Post('deletion-request/cancel')
  cancelDeletion(@Req() req: AppAuthenticatedRequest) {
    return this.me.cancelDeletion(this.uid(req))
  }

  /** 生成个人数据导出，并通过站内信返回受保护的下载地址。 */
  @HttpCode(200)
  @Post('data-export')
  dataExport(@Req() req: AppAuthenticatedRequest) {
    return this.me.dataExport(this.uid(req))
  }

  @Get('account-requests')
  accountRequests(@Req() req: AppAuthenticatedRequest) {
    return this.me.accountRequests(this.uid(req))
  }

  @Get('data-exports/:key')
  async downloadExport(
    @Req() req: AppAuthenticatedRequest,
    @Param('key') key: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.me.readExport(this.uid(req), key)
    if (!file) throw new NotFoundException('导出文件不存在')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${key}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(file)
  }

  /** 从请求中取当前用户 uid（AppJwtGuard 注入 request.user） */
  private uid(req: AppAuthenticatedRequest): string {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return payload.sub
  }
}
