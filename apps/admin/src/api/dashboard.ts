import type { Application, CommunityEvent } from '@/types'
import { applications, enterprises, events, projects, users } from '@/mock'
import { delay } from './utils'

export interface DashboardData {
  stats: {
    pendingApplications: number
    totalUsers: number
    activeEnterprises: number
    runningProjects: number
    upcomingEvents: number
  }
  pendingApplications: Application[]
  upcomingEvents: CommunityEvent[]
}

/* TODO: 替换为 GET /api/admin/dashboard — 工作台聚合数据 */
export async function fetchDashboard(): Promise<DashboardData> {
  await delay(400)
  /* 待办口径与申请审批页一致：仅入驻申请与身份绑定 */
  const pendingApplications = applications.filter(
    (a) => a.status === 'pending' && (a.type === 'settle' || a.type === 'identity'),
  )
  const upcomingEvents = events
    .filter((e) => e.status === 'published')
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 4)
  return {
    stats: {
      pendingApplications: pendingApplications.length,
      totalUsers: users.filter((u) => u.status !== 'pending').length,
      activeEnterprises: enterprises.filter((e) => e.status === 'active').length,
      runningProjects: projects.filter((p) => p.status === 'running' || p.status === 'recruiting').length,
      upcomingEvents: events.filter((e) => e.status === 'published').length,
    },
    pendingApplications: pendingApplications.slice(0, 5),
    upcomingEvents,
  }
}
