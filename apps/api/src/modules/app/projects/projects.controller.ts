import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Put, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppProjectsService } from './projects.service'
import { SubmitMilestoneDto } from './dto/submit-milestone.dto'
import { ReturnMilestoneDto } from './dto/return-milestone.dto'
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto'
import { AddFileDto } from './dto/add-file.dto'
import { AddDiscussionDto } from './dto/add-discussion.dto'

/* 项目协作（M2-R R2，/api/app/me/projects）：列表/详情、里程碑提交/验收/退回、任务/文件/讨论。 */
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

  @Get('me/projects/:id/tasks')
  listTasks(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.projects.listTasks(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('me/projects/:id/tasks')
  createTask(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: CreateTaskDto) {
    return this.projects.createTask(this.uid(req), id, dto)
  }

  @Put('me/projects/:id/tasks/:taskId')
  updateTask(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.projects.updateTask(this.uid(req), id, taskId, dto)
  }

  @Get('me/projects/:id/files')
  listFiles(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.projects.listFiles(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('me/projects/:id/files')
  addFile(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: AddFileDto) {
    return this.projects.addFile(this.uid(req), id, dto)
  }

  @Get('me/projects/:id/files/:fileId/download')
  async downloadFile(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.projects.readFile(this.uid(req), id, fileId)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(file.buffer)
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

  @Get('me/projects/:id/discussions')
  listDiscussions(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.projects.listDiscussions(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('me/projects/:id/discussions')
  addDiscussion(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: AddDiscussionDto) {
    return this.projects.addDiscussion(this.uid(req), this.name(req), id, dto)
  }

  private uid(req: AppAuthenticatedRequest): string {
    const u = req.user
    if (!u) throw new ForbiddenException('未登录或登录已过期')
    return u.sub
  }

  private name(req: AppAuthenticatedRequest): string {
    return req.user?.name ?? ''
  }
}
