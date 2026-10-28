import { Body, Controller, Get, Put, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { PaymentConfigService } from './payment-config.service'
import { SavePaymentConfigDto } from './payment-config.dto'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'

@Controller('api/admin/system/payment-config')
export class PaymentConfigController {
  constructor(private readonly service: PaymentConfigService) {}
  @Put('wechat') @RequirePermission('/system/config') save(@Body() dto: SavePaymentConfigDto, @Req() req: AuthenticatedRequest) { return this.service.save(dto, req.user!.sub) }
  @Get() @RequirePermission('/system/config') inspect() { return this.service.inspect() }
}
