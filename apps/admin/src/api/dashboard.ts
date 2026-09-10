import type { Application, CommunityEvent } from '@/types'
import { httpGet } from './http'
import type { TodoSummary } from './todos'

export interface DashboardData {
  stats: {
    pendingApplications: number
    totalUsers: number
    activeEnterprises: number
    runningProjects: number
    upcomingEvents: number
  }
  /** 六域待办聚合（工作台顶部卡片，2026-09-10 自待办中心迁入） */
  todos: TodoSummary[]
  pendingApplications: Application[]
  upcomingEvents: CommunityEvent[]
}

/* 已接入 M1 真实接口：GET /api/admin/dashboard — 工作台聚合数据
 * stats 与各域列表口径一致；待办审批取前 5、近期活动取未结束已发布前 4（含报名明细）；
 * 服务端 60s 短缓存（待办实时性优先） */
export async function fetchDashboard(): Promise<DashboardData> {
  return httpGet<DashboardData>('/dashboard')
}
