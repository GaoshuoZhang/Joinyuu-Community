import { Module } from '@nestjs/common'
import { AppDemandsController } from './demands.controller'
import { AppDemandsService } from './demands.service'

/* 移动端需求广场模块（M2-R R2，/api/app/demands + /me/demands、/me/responses）。
 * 依赖均为全局模块（Prisma/IdGenerator/Notification/PointsEngine/JwtModule），无需额外 imports。 */
@Module({
  controllers: [AppDemandsController],
  providers: [AppDemandsService],
})
export class AppDemandsModule {}