import { Module } from '@nestjs/common'
import { AppReportsController } from './reports.controller'
import { AppReportsService } from './reports.service'

/* 移动端举报与屏蔽模块（/api/app/reports、/api/app/me/reports、/api/app/me/blocklist**）。
 * 依赖均为全局模块（Prisma/IdGenerator），无需额外 imports。 */
@Module({
  controllers: [AppReportsController],
  providers: [AppReportsService],
})
export class AppReportsModule {}
