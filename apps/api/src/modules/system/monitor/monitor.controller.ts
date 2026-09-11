import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import { SchedulerService } from '../../../scheduler/scheduler.service'
import { MonitorService, type CronRunLogDto, type MonitorOverviewDto } from './monitor.service'

@Controller('api/admin/monitor')
@RequirePermission('/system/monitor')
export class MonitorController {
  constructor(
    private readonly monitor: MonitorService,
    private readonly scheduler: SchedulerService,
  ) {}

  /** 服务/Redis 健康与定时任务最近执行状态 */
  @Get('overview')
  overview(): Promise<MonitorOverviewDto> {
    return this.monitor.overview()
  }

  /** 定时任务执行日志（可按任务名筛选，最新 100 条） */
  @Get('cron-logs')
  cronLogs(@Query('jobName') jobName?: string): Promise<CronRunLogDto[]> {
    return this.monitor.cronLogs(jobName)
  }

  /** 手动触发任务执行（调试/运维用，执行后写入日志） */
  @Post('jobs/:name/run')
  @HttpCode(200)
  runJob(@Param('name') name: string): Promise<{ code: number }> {
    return this.scheduler.runJob(name)
  }
}
