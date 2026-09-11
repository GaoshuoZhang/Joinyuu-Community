import { Controller, Get } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { DemandsService, type PublisherOptionsDto } from './demands.service'

/* GET /api/admin/publisher-options —— 提交人选项（全部个人用户 + 全部企业，含联系电话自动填充）
 * 路径与需求域同级（/api/admin 而非 /api/admin/demands），故独立 Controller 挂同一模块；
 * 含联系电话，按使用它的页面权限放行（需求/企业/资讯发布 任一即可） */
@Controller('api/admin')
export class PublisherOptionsController {
  constructor(private readonly demands: DemandsService) {}

  @RequirePermission(['/demands', '/enterprises', '/contents/publish'])
  @Get('publisher-options')
  publisherOptions(): Promise<PublisherOptionsDto> {
    return this.demands.publisherOptions()
  }
}
