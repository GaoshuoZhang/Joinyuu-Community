import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { AuditLogsService } from './audit-logs.service'
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto'

@RequirePermission('/logs/audit')
@Controller('api/admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogs.findAll(query)
  }
}
