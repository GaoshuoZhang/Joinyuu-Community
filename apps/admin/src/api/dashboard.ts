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
  /** 六域待办聚合（工作台顶部卡片） */
  todos: TodoSummary[]
  pendingApplications: Application[]
  upcomingEvents: CommunityEvent[]
}

/* GET /api/admin/dashboard — 工作台聚合数据
 * stats 与各域列表口径一致；待办审核取前 5、近期活动取未结束已发布前 4（含报名明细）；
 * 服务端 60s 短缓存（待办实时性优先） */
export async function fetchDashboard(): Promise<DashboardData> {
  return httpGet<DashboardData>('/dashboard')
}

/* ---------- 趋势分析 ---------- */

export interface TrendPoint {
  date: string
  /** 当日注册用户数（社区成员口径） */
  members: number
  /** 当日新增需求数 */
  demands: number
  /** 当日新增活动数 */
  events: number
  /** 当日发放积分总数 */
  points: number
}

/** GET /api/admin/dashboard/trend?days=30 */
export async function fetchTrend(days = 30): Promise<TrendPoint[]> {
  return httpGet<TrendPoint[]>(`/dashboard/trend?days=${days}`)
}
