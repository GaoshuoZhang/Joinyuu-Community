import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Put, Query, Req, Res, UnauthorizedException } from '@nestjs/common'
import { LicenseMaintenance } from '../../../common/license/license.guard'
import type { Response } from 'express'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { PageQueryDto } from '../../../common/dto/page-query.dto'
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

  /** 永久隐藏新手任务（按账号持久化，跨浏览器一致；幂等） */
  @HttpCode(200)
  @Post('activation-dismissed')
  dismissActivation(@Req() req: AppAuthenticatedRequest) {
    return this.me.dismissActivation(this.uid(req))
  }

  /** 我的积分流水（分页倒序，含 balance；keyword 可选，匹配事由/来源） */
  @Get('points-records')
  pointsRecords(
    @Req() req: AppAuthenticatedRequest,
    @Query() query: PageQueryDto,
    @Query('keyword') keyword?: string,
  ) {
    return this.me.pointsRecords(this.uid(req), query.page, query.pageSize, keyword)
  }

  /** 我的经验与等级（identity=community_enterprise + enterpriseId 查企业维度；默认社区个体） */
  @Get('experience-records')
  experienceRecords(
    @Req() req: AppAuthenticatedRequest,
    @Query('identity') identity?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.me.experienceRecords(this.uid(req), identity, enterpriseId)
  }

  /** 登录态修改密码（成功后强制退出全部会话，需重新登录） */
  @HttpCode(200)
  @Post('change-password')
  @LicenseMaintenance()
  changePassword(@Req() req: AppAuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.me.changePassword(this.uid(req), dto)
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
  @LicenseMaintenance()
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
