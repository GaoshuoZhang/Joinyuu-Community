import { Controller, Get } from '@nestjs/common'
import { DemandsService, type PublisherOptionsDto } from './demands.service'

/* GET /api/admin/publisher-options —— 提交人选项（全部个人用户 + 全部企业，含联系方式自动填充）
 * 路径与需求域同级（/api/admin 而非 /api/admin/demands），故独立 Controller 挂同一模块 */
@Controller('api/admin')
export class PublisherOptionsController {
  constructor(private readonly demands: DemandsService) {}

  @Get('publisher-options')
  publisherOptions(): Promise<PublisherOptionsDto> {
    return this.demands.publisherOptions()
  }
}
