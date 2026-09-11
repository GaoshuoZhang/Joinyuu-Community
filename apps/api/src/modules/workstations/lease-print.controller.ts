import { Controller, Get, Param } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { WorkstationsService } from './workstations.service'

/* 租约打印单：复用租约详情数据（无新表），供打印视图/单据导出 */
@RequirePermission('/workstations/leases')
@Controller('api/admin/leases')
export class LeasePrintController {
  constructor(private readonly workstations: WorkstationsService) {}

  @Get(':id/print')
  print(@Param('id') id: string): Promise<Record<string, unknown>> {
    return this.workstations.leasePrint(id)
  }
}
