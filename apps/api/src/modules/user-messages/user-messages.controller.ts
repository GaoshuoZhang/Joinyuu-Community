import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { UserMessagesService } from './user-messages.service'
import { QueryUserMessagesDto, ReplyMessageDto } from './dto/message.dto'

/* 用户留言（M2-R R4 /api/admin/user-messages）：一级菜单「用户留言」，
 * 查看客户端提交的留言并回复；回复后向留言人推送站内信。 */
@RequirePermission('/user-messages')
@Controller('api/admin/user-messages')
export class UserMessagesController {
  constructor(private readonly messages: UserMessagesService) {}

  @Get()
  findAll(@Query() query: QueryUserMessagesDto) {
    return this.messages.findAll(query)
  }

  @HttpCode(200)
  @Post(':id/reply')
  reply(@Param('id') id: string, @Body() dto: ReplyMessageDto, @Req() req: AuthenticatedRequest) {
    return this.messages.reply(id, dto, req.user?.name ?? '社区管理员')
  }

  /** 归档留言（仅已回复）：写入软删除标记，可在「归档管理 > 用户留言」恢复 */
  @HttpCode(200)
  @Post(':id/archive')
  archive(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.messages.archive(id, req.user?.name ?? '社区管理员')
  }
}
