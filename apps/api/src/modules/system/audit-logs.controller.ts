import { Controller, Get, Query } from '@nestjs/common'
import { AuditLogsService } from './audit-logs.service'
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto'

@Controller('api/admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogs.findAll(query)
  }
}
