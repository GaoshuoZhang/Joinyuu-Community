import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { SystemConfigService } from './system-config.service'
import { SystemConfigPayloadDto } from './dto/system-config-payload.dto'

@RequirePermission('/system/config')
@Controller('api/admin/system/config')
export class SystemConfigController {
  constructor(private readonly config: SystemConfigService) {}

  @Get()
  get() {
    return this.config.get()
  }

  /** 实名核验供应商目录（管理端表单渲染与校验共用） */
  @Get('realname/catalog')
  realnameCatalog() {
    return this.config.realnameCatalog()
  }

  /** 测试实名核验联通：接口可调用即算联通；成功后才允许客户端显示「实名认证」 */
  @Post('realname/test')
  @HttpCode(HttpStatus.OK)
  testRealname(@Req() req: AuthenticatedRequest) {
    return this.config.testRealnameVerification(req.user?.name ?? '社区管理员')
  }

  @Put()
  save(@Body() dto: SystemConfigPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.config.save(dto, req.user?.name ?? '社区管理员')
  }
}
