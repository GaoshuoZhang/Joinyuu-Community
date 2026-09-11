import { Controller, Get, Query } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { DashboardService } from './dashboard.service'

/* 工作台聚合与统一待办（wiki-backend.md §7.16）：GET /api/admin/dashboard、GET /api/admin/todos */
@RequirePermission('/dashboard')
@Controller('api/admin')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  getDashboard() {
    return this.dashboard.getDashboard()
  }

  @Get('todos')
  getTodos() {
    return this.dashboard.getTodos()
  }

  /** 运营趋势（默认 30 天，范围 3~90） */
  @Get('dashboard/trend')
  getTrend(@Query('days') days?: string) {
    return this.dashboard.getTrend(Number(days) || 30)
  }
}
