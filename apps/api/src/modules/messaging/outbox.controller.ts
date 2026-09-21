import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { OutboxService } from './outbox.service'
import { QueryOutboxDto } from './dto/outbox.dto'

/* 发送记录（P0 Outbox）：投递状态、失败原因、投递日志、手动重试与终止。 */
@RequirePermission('/system/messages')
@Controller('api/admin/outbox')
export class OutboxController {
  constructor(private readonly outbox: OutboxService) {}

  @Get()
  list(@Query() query: QueryOutboxDto) {
    return this.outbox.list(query)
  }

  @Get(':id/logs')
  logs(@Param('id') id: string) {
    return this.outbox.logs(id)
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retry(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.outbox.retry(id, req.user?.name ?? '社区管理员')
  }

  @Post(':id/discard')
  @HttpCode(HttpStatus.OK)
  discard(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.outbox.discard(id, req.user?.name ?? '社区管理员')
  }
}
