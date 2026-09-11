import { Controller, Get } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { WorkstationsService, type RenterOptionsDto } from './workstations.service'

/* GET /api/admin/renter-options —— 租赁方选项（全部个人用户 + 全部企业，含联系电话自动填充）
 * 路径与办公位域同级（/api/admin 而非 /api/admin/workstations），故独立 Controller 挂同一模块；
 * 含联系电话，按租赁管理权限放行 */
@Controller('api/admin')
export class RenterOptionsController {
  constructor(private readonly workstations: WorkstationsService) {}

  @RequirePermission('/workstations/leases')
  @Get('renter-options')
  renterOptions(): Promise<RenterOptionsDto> {
    return this.workstations.renterOptions()
  }
}
