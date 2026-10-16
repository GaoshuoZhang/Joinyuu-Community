import { Body, Controller, Get, Put, Query, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { AuditLogsService } from './audit-logs.service'
import { SystemConfigService } from './system-config.service'
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto'
import { LogRetentionDto } from './dto/log-retention.dto'

@RequirePermission('/logs/audit')
@Controller('api/admin/audit-logs')
export class AuditLogsController {
  constructor(
    private readonly auditLogs: AuditLogsService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  @Get()
  findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogs.findAll(query)
  }

  /** 日志保留期（操作日志/登录日志，0 = 永久保存）：两个日志页任一权限即可读写。
   * 方法级 @RequirePermission 覆盖类级（守卫用 getAllAndOverride），因此这里不再只要求 /logs/audit */
  @RequirePermission(['/logs/audit', '/logs/login'])
  @Get('retention')
  logRetention() {
    return this.systemConfig.logRetention()
  }

  @RequirePermission(['/logs/audit', '/logs/login'])
  @Put('retention')
  saveLogRetention(@Body() dto: LogRetentionDto, @Req() req: AuthenticatedRequest) {
    return this.systemConfig.saveLogRetention(dto, req.user?.name ?? '社区管理员')
  }
}
