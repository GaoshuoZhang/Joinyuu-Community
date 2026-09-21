import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { MessageTemplateService } from './message-template.service'
import {
  CreateTemplateDto,
  PublishTemplateDto,
  ReviewTemplateDto,
  SaveTemplateDraftDto,
  TestTemplateDto,
} from './dto/message-template.dto'

/* 消息模板（P0）：变量白名单 + 版本化（保存即发布）+ 历史版本回滚 + 测试发送。 */
@RequirePermission('/system/messages')
@Controller('api/admin/message-templates')
export class MessageTemplateController {
  constructor(private readonly templates: MessageTemplateService) {}

  @Get()
  list() {
    return this.templates.list()
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.templates.detail(id)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Body() dto: CreateTemplateDto, @Req() req: AuthenticatedRequest) {
    return this.templates.create(dto, req.user?.name ?? '社区管理员')
  }

  @Put(':id/draft')
  saveDraft(
    @Param('id') id: string,
    @Body() dto: SaveTemplateDraftDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.templates.saveDraft(id, dto, req.user?.name ?? '社区管理员')
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.templates.submit(id, req.user?.name ?? '社区管理员')
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.templates.review(id, dto, req.user?.name ?? '社区管理员')
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('id') id: string,
    @Body() dto: PublishTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.templates.publish(id, dto, req.user?.name ?? '社区管理员')
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  disable(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.templates.disable(id, req.user?.name ?? '社区管理员')
  }

  @Post(':id/test-send')
  @HttpCode(HttpStatus.OK)
  testSend(@Param('id') id: string, @Body() dto: TestTemplateDto, @Req() req: AuthenticatedRequest) {
    return this.templates.testSend(id, dto, req.user?.name ?? '社区管理员')
  }

  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  preview(@Param('id') id: string, @Body() dto: TestTemplateDto) {
    return this.templates.preview(id, dto)
  }
}
