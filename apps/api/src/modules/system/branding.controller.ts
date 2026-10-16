import { Controller, Get } from '@nestjs/common'
import { SystemConfigService } from './system-config.service'

/* 后台壳品牌（站点名称 + 站点 logo）：有意不挂 @RequirePermission——
 * 所有后台角色都需要在左上角与浏览器标签页看到正确的站点品牌，
 * 而站点名称/logo 并非敏感信息，且各角色不一定持有 /system/config 权限。 */
@Controller('api/admin')
export class BrandingController {
  constructor(private readonly systemConfig: SystemConfigService) {}

  @Get('branding')
  branding(): Promise<{ siteName: string; siteSlogan: string; siteLogo: string }> {
    return this.systemConfig.branding()
  }
}
