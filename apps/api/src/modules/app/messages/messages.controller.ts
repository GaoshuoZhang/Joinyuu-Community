import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppMessagesService } from './messages.service'
import { CreateMessageDto } from './dto/create-message.dto'

/* 用户留言（M2-R R4）：客户端登录用户提交留言并查看后台回复；入口在「我的」与「社区 > 社区服务」。 */
@Controller('api/app/me')
export class AppMessagesController {
  constructor(private readonly messages: AppMessagesService) {}

  /** 提交留言 */
  @HttpCode(200)
  @Post('messages')
  create(@Req() req: AppAuthenticatedRequest, @Body() dto: CreateMessageDto) {
    return this.messages.create(this.uid(req), dto)
  }

  /** 我的留言（含后台回复） */
  @Get('messages')
  list(@Req() req: AppAuthenticatedRequest) {
    return this.messages.list(this.uid(req))
  }

  private uid(req: AppAuthenticatedRequest): string {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return payload.sub
  }
}
