import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { AnnouncementsService } from './announcements.service'
import { QueryAnnouncementsDto } from './dto/query-announcements.dto'
import { AnnouncementPayloadDto } from './dto/announcement-payload.dto'
import { HomeAnnouncementPayloadDto } from './dto/home-announcement-payload.dto'

@RequirePermission('/contents/announcements')
@Controller('api/admin/announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  findAll(@Query() query: QueryAnnouncementsDto) {
    return this.announcements.findAll(query)
  }

  /* 首页公告单例：读取当前开启/最近一条（空表单兜底） */
  @Get('home')
  getHome() {
    return this.announcements.getHomeAnnouncement()
  }

  /* 首页公告单例：保存内容与开启状态（需在 @Put(':id') 之前声明，避免 home 被当作 id 匹配） */
  @HttpCode(200)
  @Put('home')
  saveHome(@Body() dto: HomeAnnouncementPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.announcements.saveHomeAnnouncement(dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: AnnouncementPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.announcements.create(dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: AnnouncementPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.announcements.update(id, dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/withdraw')
  withdraw(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.announcements.withdraw(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/publish')
  publish(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.announcements.publish(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/toggle-pin')
  togglePin(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.announcements.togglePin(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.announcements.remove(id, req.user?.name ?? '社区管理员')
  }
}
