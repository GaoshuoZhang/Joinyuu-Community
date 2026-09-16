import { Body, Controller, Get, HttpCode, Post, Query, Req, UnauthorizedException } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppFavoritesService } from './favorites.service'
import { ToggleFavoriteDto } from './dto/toggle-favorite.dto'

@Controller('api/app/me')
export class AppFavoritesController {
  constructor(private readonly favorites: AppFavoritesService) {}

  /** 我的收藏（createdAt 倒序；type 可选过滤） */
  @Get('favorites')
  list(@Req() req: AppAuthenticatedRequest, @Query('type') type?: string) {
    return this.favorites.list(this.uid(req), type)
  }

  /** 收藏/取消收藏切换（存在即取消；返回切换后的收藏状态） */
  @HttpCode(200)
  @Post('favorites/toggle')
  toggle(@Req() req: AppAuthenticatedRequest, @Body() dto: ToggleFavoriteDto) {
    return this.favorites.toggle(this.uid(req), dto)
  }

  /** 从请求中取当前用户 uid（AppJwtGuard 注入 request.user） */
  private uid(req: AppAuthenticatedRequest): string {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return payload.sub
  }
}
