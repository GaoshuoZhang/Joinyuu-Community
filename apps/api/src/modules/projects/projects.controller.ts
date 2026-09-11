import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { ProjectsService } from './projects.service'
import { QueryProjectsDto } from './dto/query-projects.dto'
import { CreateProjectDto } from './dto/create-project.dto'
import { CloseProjectDto } from './dto/close-project.dto'

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
  update(@Param('id') id: string, @Body() dto: CreateProjectDto) {
    return this.projects.update(id, dto)
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
}
