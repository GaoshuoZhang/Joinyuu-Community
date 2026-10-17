import { Controller, Get } from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator'
import { APP_VERSION } from '../common/version'

/* 健康检查（公开）：供网关/监控探活；同时回传服务端版本，便于运维与前端展示对齐。 */
@Public()
@Controller('api/health')
export class HealthController {
  @Get()
  check(): { status: string; version: string } {
    return { status: 'ok', version: APP_VERSION }
  }
}
