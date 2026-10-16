import { Module } from '@nestjs/common'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { ProjectMilestoneReviewService } from './project-milestone-review.service'
import { AssetsModule } from '../assets/assets.module'

/* 项目域（wiki-backend.md §7.7）；导出 ProjectsService 供 demands 模块复用 createProject；
 * 导出 ProjectMilestoneReviewService 供 app/projects（客户端验收）复用同一套里程碑审核核心；
 * 项目合同附件复用素材库存储管道，故引入 AssetsModule */
@Module({
  imports: [AssetsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMilestoneReviewService],
  exports: [ProjectsService, ProjectMilestoneReviewService],
})
export class ProjectsModule {}
