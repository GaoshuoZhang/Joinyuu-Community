import { Body, Controller, Get, Put, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { SystemConfigService } from './system-config.service'
import { SystemConfigPayloadDto } from './dto/system-config-payload.dto'

@Controller('api/admin/system/config')
export class SystemConfigController {
  constructor(private readonly config: SystemConfigService) {}

  @Get()
  get() {
    return this.config.get()
  }

  @Put()
  save(@Body() dto: SystemConfigPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.config.save(dto, req.user?.name ?? '社区管理员')
  }
}
