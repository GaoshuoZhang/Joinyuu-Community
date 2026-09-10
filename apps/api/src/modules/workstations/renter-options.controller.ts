import { Controller, Get } from '@nestjs/common'
import { WorkstationsService, type RenterOptionsDto } from './workstations.service'

/* GET /api/admin/renter-options —— 租赁方选项（全部个人用户 + 全部企业，含联系方式自动填充）
 * 路径与工位域同级（/api/admin 而非 /api/admin/workstations），故独立 Controller 挂同一模块 */
@Controller('api/admin')
export class RenterOptionsController {
  constructor(private readonly workstations: WorkstationsService) {}

  @Get('renter-options')
  renterOptions(): Promise<RenterOptionsDto> {
    return this.workstations.renterOptions()
  }
}
