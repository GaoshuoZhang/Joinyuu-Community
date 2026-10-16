import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { ProjectsService } from './projects.service'
import type { MallAssetDto, UploadedFileLike } from '../assets/assets.service'
import { QueryProjectsDto } from './dto/query-projects.dto'
import { CreateProjectDto } from './dto/create-project.dto'
import { CloseProjectDto } from './dto/close-project.dto'
import { ReturnMilestoneDto } from './dto/return-milestone.dto'

@RequirePermission('/projects')
@Controller('api/admin/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  findAll(@Query() query: QueryProjectsDto) {
    return this.projects.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projects.detail(id)
  }

  @Post()
  create(@Body() dto: CreateProjectDto, @Req() req: AuthenticatedRequest) {
    return this.projects.createProject(dto, req.user?.name ?? '社区管理员')
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateProjectDto, @Req() req: AuthenticatedRequest) {
    return this.projects.update(id, dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/pause')
  pause(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.projects.pause(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/resume')
  resume(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.projects.resume(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseProjectDto, @Req() req: AuthenticatedRequest) {
    return this.projects.close(id, dto.reason, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/archive')
  archive(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.projects.archive(id, req.user?.name ?? '社区管理员')
  }

  /** 「进度节点」验收：待验收 → 已验收（全部通过自动结项并按承接占比发经验） */
  @HttpCode(200)
  @Post(':id/milestones/:milestoneId/accept')
  acceptMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projects.acceptMilestone(id, milestoneId, req.user?.name ?? '社区管理员')
  }

  /** 「进度节点」驳回：待验收 → 已退回（原因必填，承接方可重新提交） */
  @HttpCode(200)
  @Post(':id/milestones/:milestoneId/return')
  returnMilestone(
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: ReturnMilestoneDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projects.returnMilestone(id, milestoneId, dto.reason, req.user?.name ?? '社区管理员')
  }

  /** 线下签约合同附件（图片/PDF）：列表；已归档项目仍可查看 */
  @Get(':id/contracts')
  contracts(@Param('id') id: string): Promise<MallAssetDto[]> {
    return this.projects.projectContracts(id)
  }

  /** 上传合同附件（multipart，字段名 file）；大小上限取系统配置 uploadMaxSizeMb */
  @HttpCode(200)
  @Post(':id/contracts')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  uploadContract(
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileLike,
    @Req() req: AuthenticatedRequest,
  ): Promise<MallAssetDto> {
    return this.projects.uploadProjectContract(id, file, req.user?.name ?? '社区管理员')
  }

  /** 删除合同附件（仅限该项目名下附件） */
  @HttpCode(200)
  @Delete(':id/contracts/:assetId')
  removeContract(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.projects.removeProjectContract(id, assetId, req.user?.name ?? '社区管理员')
  }
}
