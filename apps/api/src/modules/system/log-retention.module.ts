import { Module } from '@nestjs/common'
import { LogRetentionService } from './log-retention.service'

/* 日志保留期清理：仅向 SchedulerModule 暴露 run()（PrismaService/AuditService 由全局模块提供） */
@Module({
  providers: [LogRetentionService],
  exports: [LogRetentionService],
})
export class LogRetentionModule {}
