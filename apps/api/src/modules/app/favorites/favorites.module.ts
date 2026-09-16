import { Module } from '@nestjs/common'
import { AppFavoritesController } from './favorites.controller'
import { AppFavoritesService } from './favorites.service'

/* 我的收藏模块（M2-R R3 /api/app/me/favorites）：列表 + 收藏/取消切换（幂等去重靠唯一约束）。
 * 依赖 PrismaService 为全局模块，无需额外 imports。 */
@Module({
  controllers: [AppFavoritesController],
  providers: [AppFavoritesService],
})
export class AppFavoritesModule {}
