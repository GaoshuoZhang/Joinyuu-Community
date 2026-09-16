import { Controller, Get, Param } from '@nestjs/common'
import { Public } from '../../../common/decorators/public.decorator'
import { ConfigService, type DictBundleDto, type SiteConfigDto } from './config.service'

/* 配置与字典下发（M2-R R1，@Public 免登录）：
 * GET /api/app/config          — 站点配置与功能开关精简下发
 * GET /api/app/dicts/:type     — 单一字典启用项
 * GET /api/app/dicts           — 批量字典启用项（4 类） */
@Controller('api/app')
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('config')
  getSiteConfig(): Promise<SiteConfigDto> {
    return this.config.getSiteConfig()
  }

  @Public()
  @Get('dicts/:type')
  getDict(@Param('type') type: string): Promise<DictBundleDto> {
    return this.config.getDict(type)
  }

  @Public()
  @Get('dicts')
  getDictBundle(): Promise<Record<string, DictBundleDto>> {
    return this.config.getDictBundle()
  }
}