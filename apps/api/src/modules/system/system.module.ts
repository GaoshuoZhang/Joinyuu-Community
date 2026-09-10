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

/* 系统管理域（wiki-backend.md §7.15/§7.16）：
 * 通知中心 / 审计日志查询 / 系统配置 / 数据字典 / 工作台聚合（dashboard + todos），共 12 端点。 */
@Module({
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
