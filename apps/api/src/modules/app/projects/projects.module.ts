import { Module } from '@nestjs/common'
import { AppProjectsController } from './projects.controller'
import { AppProjectsService } from './projects.service'
import { ProjectsModule } from '../../projects/projects.module'

/* 移动端项目协作模块（M2-R R2，/api/app/me/projects）。
 * 里程碑验收/退回复用后台同款核心（ProjectMilestoneReviewService），故引入 ProjectsModule；
 * 其余依赖均为全局模块（Prisma/IdGenerator/Notification/PointsEngine）。 */
@Module({
  imports: [ProjectsModule],
  controllers: [AppProjectsController],
  providers: [AppProjectsService],
})
export class AppProjectsModule {}
