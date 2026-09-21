import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { MessageChannelService } from './message-channel.service'
import {
  MessageChannelPayloadDto,
  TestSendDto,
  ToggleChannelDto,
} from './dto/message-channel.dto'
import { CHANNEL_KINDS, PROVIDER_CATALOG } from './messaging.types'

/* 消息渠道配置（P0）：只读写非机密配置；凭据以环境变量名登记，永不回传值。 */
@RequirePermission('/system/messages')
@Controller('api/admin/message-channels')
export class MessageChannelController {
  constructor(private readonly channels: MessageChannelService) {}

  @Get()
  list() {
    return this.channels.list()
  }

  /** 驱动目录与消息类型（管理端表单渲染与校验共用） */
  @Get('catalog')
  catalog() {
    return { kinds: CHANNEL_KINDS, providers: PROVIDER_CATALOG }
  }

  @Put()
  upsert(@Body() dto: MessageChannelPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.channels.upsert(dto, req.user?.name ?? '社区管理员')
  }

  @Patch(':id/enabled')
  setEnabled(
    @Param('id') id: string,
    @Body() dto: ToggleChannelDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.channels.setEnabled(id, dto.enabled, req.user?.name ?? '社区管理员')
  }

  @Post(':id/test-send')
  @HttpCode(HttpStatus.OK)
  testSend(@Param('id') id: string, @Body() dto: TestSendDto, @Req() req: AuthenticatedRequest) {
    return this.channels.testSend(id, dto, req.user?.name ?? '社区管理员')
  }
}
