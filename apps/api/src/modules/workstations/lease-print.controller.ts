import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { WorkstationsService, type LeasePrintLayoutDto } from './workstations.service'
import { UpdateLeasePrintLayoutDto } from './dto/update-lease-print-layout.dto'

/* 租约打印单与打印版式（复用租约详情数据，单例配置无业务表）；
 * 权限沿用租赁管理已有的 /workstations/leases，不新增权限码。 */
@RequirePermission('/workstations/leases')
@Controller('api/admin/leases')
export class LeasePrintController {
  constructor(private readonly workstations: WorkstationsService) {}

  /** 打印版式（全局单例）：无配置时返回默认值 */
  @Get('print-layout')
  printLayout(): Promise<LeasePrintLayoutDto> {
    return this.workstations.getLeasePrintLayout()
  }

  /** 更新打印版式（写审计） */
  @Put('print-layout')
  updatePrintLayout(
    @Body() dto: UpdateLeasePrintLayoutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LeasePrintLayoutDto> {
    return this.workstations.updateLeasePrintLayout(dto, req.user?.name ?? '社区管理员')
  }

  @Get(':id/print')
  print(@Param('id') id: string): Promise<Record<string, unknown>> {
    return this.workstations.leasePrint(id)
  }
}
