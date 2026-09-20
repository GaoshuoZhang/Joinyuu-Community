import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { AuditLogsController } from './audit-logs.controller'
import { AuditLogsService } from './audit-logs.service'
import { SystemConfigController } from './system-config.controller'
import { SystemConfigService } from './system-config.service'
import { DictsController } from './dicts.controller'
import { DictsService } from './dicts.service'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { RealnameModule } from '../../common/realname/realname.module'

/* 系统管理域（wiki-backend.md §7.15/§7.16/§7.17）：
 * 通知中心 / 操作日志查询 / 系统配置（含实名核验配置与联通测试）/ 数据字典 / 工作台聚合。 */
@Module({
  imports: [RealnameModule],
  controllers: [
    NotificationsController,
    AuditLogsController,
    SystemConfigController,
    DictsController,
    DashboardController,
  ],
  providers: [NotificationsService, AuditLogsService, SystemConfigService, DictsService, DashboardService],
})
export class SystemModule {}
