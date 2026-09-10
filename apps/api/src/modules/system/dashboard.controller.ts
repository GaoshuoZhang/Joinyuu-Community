import { Controller, Get } from '@nestjs/common'
import { DashboardService } from './dashboard.service'

/* 工作台聚合与统一待办（wiki-backend.md §7.16）：GET /api/admin/dashboard、GET /api/admin/todos */
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
}
