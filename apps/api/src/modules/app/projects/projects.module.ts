import { Module } from '@nestjs/common'
import { AppProjectsController } from './projects.controller'
import { AppProjectsService } from './projects.service'

/* 移动端项目协作模块（M2-R R2，/api/app/me/projects）。
 * 依赖均为全局模块（Prisma/IdGenerator/Notification/PointsEngine），无需额外 imports。 */
@Module({
  controllers: [AppProjectsController],
  providers: [AppProjectsService],
})
export class AppProjectsModule {}