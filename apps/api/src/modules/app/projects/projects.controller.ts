import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppProjectsService } from './projects.service'
import { SubmitMilestoneDto } from './dto/submit-milestone.dto'
import { ReturnMilestoneDto } from './dto/return-milestone.dto'

/* 项目履约（/api/app/me/projects）：列表/详情、里程碑提交/验收/退回与附件下载。 */
@Controller('api/app')
export class AppProjectsController {
  constructor(private readonly projects: AppProjectsService) {}

  @Get('me/projects')
  myProjects(@Req() req: AppAuthenticatedRequest) {
    return this.projects.myProjects(this.uid(req))
  }

  @Get('me/projects/:id')
  projectDetail(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.projects.projectDetail(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('me/projects/:id/milestones/:milestoneId/submit')
  submitMilestone(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: SubmitMilestoneDto,
  ) {
    return this.projects.submitMilestone(this.uid(req), id, milestoneId, dto)
  }

  @HttpCode(200)
  @Post('me/projects/:id/milestones/:milestoneId/accept')
  acceptMilestone(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Param('milestoneId') milestoneId: string) {
    return this.projects.acceptMilestone(this.uid(req), id, milestoneId)
  }

  @HttpCode(200)
  @Post('me/projects/:id/milestones/:milestoneId/return')
  returnMilestone(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: ReturnMilestoneDto,
  ) {
    return this.projects.returnMilestone(this.uid(req), id, milestoneId, dto)
  }

  @Get('me/projects/:id/attachments/:storeKey/download')
  async downloadAttachment(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Param('storeKey') storeKey: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.projects.readAttachment(this.uid(req), id, storeKey)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(file.buffer)
  }

  private uid(req: AppAuthenticatedRequest): string {
    const u = req.user
    if (!u) throw new ForbiddenException('未登录或登录已过期')
    return u.sub
  }
}
