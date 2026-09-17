import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { BannersService } from './banners.service'
import { BannerPayloadDto, BannerSettingsDto } from './dto/banner-payload.dto'

@RequirePermission('/contents/banners')
@Controller('api/admin/contents/banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  findAll() {
    return this.banners.findAll()
  }

  @Get('settings')
  getSettings() {
    return this.banners.getSettings()
  }

  @HttpCode(200)
  @Put('settings')
  saveSettings(@Body() dto: BannerSettingsDto, @Req() req: AuthenticatedRequest) {
    return this.banners.saveSettings(dto.carouselOpen, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: BannerPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.banners.create(dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: BannerPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.banners.update(id, dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/toggle-enabled')
  toggleEnabled(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.banners.toggleEnabled(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.banners.remove(id, req.user?.name ?? '社区管理员')
  }
}
