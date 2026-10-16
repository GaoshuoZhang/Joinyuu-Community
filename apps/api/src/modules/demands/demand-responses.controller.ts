import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { DemandsService, type PendingRespondentDto } from './demands.service'
import { QueryDemandResponsesDto } from './dto/query-demand-responses.dto'

/* 响应审核（「业务运营 → 响应审核」）：独立控制器避开 DemandsController 的 :id 路由顺序；
 * 权限与需求审核/需求管理同组 any-of，审核动作复用 POST /api/admin/demands/:id/respondents/:respondentId/review */
@RequirePermission(['/demands/responses', '/demands/review', '/demands'])
@Controller('api/admin/demand-responses')
export class DemandResponsesController {
  constructor(private readonly demands: DemandsService) {}

  @Get()
  findAll(@Query() query: QueryDemandResponsesDto): Promise<{ list: PendingRespondentDto[]; total: number }> {
    return this.demands.findPendingRespondents(query)
  }
}
