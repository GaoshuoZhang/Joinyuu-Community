import { Controller, Get } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { SystemConfigService } from './system-config.service'

/* 后台壳品牌（站点名称 + 站点标语 + 站点 logo）：@Public 且不挂 @RequirePermission——
 * 所有后台角色都需要在左上角与浏览器标签页看到正确的站点品牌，而各角色不一定持有 /system/config 权限；
 * 公开读取是为了让**未登录的登录页与标签页**也能显示站点品牌（与客户端 /api/app/config 同口径）。
 * 出参仅三个非敏感字段（站点名称/标语/logo URL，且 logo 走本就公开的 /api/public/files/*）。 */
@Controller('api/admin')
export class BrandingController {
  constructor(private readonly systemConfig: SystemConfigService) {}

  @Public()
  @Get('branding')
  branding(): Promise<{ siteName: string; siteSlogan: string; siteLogo: string }> {
    return this.systemConfig.branding()
  }
}
