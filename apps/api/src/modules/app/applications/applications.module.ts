import { Module } from '@nestjs/common'
import { AppApplicationsController } from './applications.controller'
import { AppApplicationsService } from './applications.service'

/* 申请（M2-R R2 /api/app/applications）：表单 schema 下发、schema 驱动提交（写 Application + records 时间线）、
 * 我的申请、撤回 / 修改重提 / 回填。依赖均为全局模块。 */
@Module({
  controllers: [AppApplicationsController],
  providers: [AppApplicationsService],
})
export class AppApplicationsModule {}