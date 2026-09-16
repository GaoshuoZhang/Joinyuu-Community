import { Module } from '@nestjs/common'
import { AppHomeController } from './home.controller'
import { AppHomeService } from './home.service'

/* 首页聚合（M2-R R2 GET /api/app/home）：siteInfo + 公告/运营位 + 精选活动/最新需求/置顶文章 + 未读数。
 * JwtService 用于 @Public 下可选登录态判定未读数。 */
@Module({
  controllers: [AppHomeController],
  providers: [AppHomeService],
})
export class AppHomeModule {}