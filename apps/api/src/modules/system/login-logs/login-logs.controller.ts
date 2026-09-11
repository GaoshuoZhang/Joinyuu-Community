import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import { LoginLogService, type LoginLogDto } from './login-log.service'
import { QueryLoginLogsDto } from './dto/query-login-logs.dto'

@Controller('api/admin/login-logs')
export class LoginLogsController {
  constructor(private readonly logs: LoginLogService) {}

  @Get()
  @RequirePermission('/logs/login')
  list(@Query() query: QueryLoginLogsDto): Promise<{ list: LoginLogDto[]; total: number }> {
    return this.logs.list(query)
  }
}
