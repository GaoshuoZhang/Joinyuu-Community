import type { Application, CommunityEvent } from '@/types'
import { applications, enterprises, events, projects, users } from '@/mock'
import { delay } from './utils'
import { fetchTodos, type TodoSummary } from './todos'

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

/* TODO: 替换为 GET /api/admin/dashboard — 工作台聚合数据 */
export async function fetchDashboard(): Promise<DashboardData> {
  await delay(400)
  /* 待办口径与申请审批页一致：仅入驻申请与身份绑定 */
  const pendingApplications = applications.filter(
    (a) => a.status === 'pending' && (a.type === 'settle' || a.type === 'identity'),
  )
  /* 近期活动仅展示未结束的已发布活动（结束时间已过的活动视为已结束，与活动列表口径一致） */
  const now = formatNow()
  const publishedNotEnded = events
    .filter((e) => e.status === 'published' && e.endTime >= now)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const todos = await fetchTodos()
  return {
    stats: {
      pendingApplications: pendingApplications.length,
      totalUsers: users.length,
      activeEnterprises: enterprises.filter((e) => e.status === 'active').length,
      runningProjects: projects.filter((p) => p.status === "running").length,
      upcomingEvents: publishedNotEnded.length,
    },
    todos,
    pendingApplications: pendingApplications.slice(0, 5),
    upcomingEvents: publishedNotEnded.slice(0, 4),
  }
}

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
