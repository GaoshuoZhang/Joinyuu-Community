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

/* 消息渠道配置：凭据支持只写密钥或环境变量名，均不回传原文。 */
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

  @Post()
  create(@Body() dto: MessageChannelPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.channels.upsert(dto, req.user?.name ?? '社区管理员')
  }

  /** 兼容旧创建入口；同样禁止隐式覆盖已有渠道。 */
  @Put()
  createLegacy(@Body() dto: MessageChannelPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.create(dto, req)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: MessageChannelPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.channels.upsert(dto, req.user?.name ?? '社区管理员', id)
  }

  /** 每种通知类型一个固定配置；在事务中替换供应商，保留历史记录与发送日志关联。 */
  @Put('fixed/:kind')
  saveFixed(@Param('kind') kind: string, @Body() dto: MessageChannelPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.channels.saveFixed(kind, dto, req.user?.name ?? '社区管理员')
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
