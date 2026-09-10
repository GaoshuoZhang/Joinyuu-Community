import { applications, articles, demands, leases, reservations, showcaseRequests } from '@/mock'
import { delay } from './utils'
import { deriveLeaseStatus } from './workstations'

export interface TodoSummary {
  key: string
  title: string
  description: string
  count: number
  /** 去处理跳转路由（默认视图即待办列表） */
  route: string
}

/* TODO: 替换为 GET /api/admin/todos — 统一待办中心聚合数据
 * 聚合各业务域的待处理事项：入驻审批 / 需求审核 / 空间预约 / 展示页发布 / 文章审核 / 临期租约 */
export async function fetchTodos(): Promise<TodoSummary[]> {
  await delay(300)
  const pendingApplications = applications.filter(
    (a) => a.status === 'pending' && (a.type === 'settle' || a.type === 'identity'),
  ).length
  const pendingDemands = demands.filter((d) => d.status === 'pending').length
  const pendingReservations = reservations.filter((r) => r.status === 'pending').length
  const pendingShowcases = showcaseRequests.filter((r) => r.status === 'pending').length
  const pendingArticles = articles.filter((a) => a.status === 'pending').length
  const expiringLeases = leases.filter((l) => deriveLeaseStatus(l) === 'expiring').length
  return [
    { key: 'settle', title: '入驻/身份审批', description: '入驻申请与身份绑定待审批', count: pendingApplications, route: '/approvals' },
    { key: 'demand', title: '需求审核', description: '待审核需求，通过后转待发布', count: pendingDemands, route: '/demands/review' },
    { key: 'reservation', title: '空间预约审批', description: '待审批的空间预约申请', count: pendingReservations, route: '/spaces/reservations' },
    { key: 'showcase', title: '展示页发布', description: '企业/个人展示页发布申请', count: pendingShowcases, route: '/contents/showcase' },
    { key: 'article', title: '文章审核', description: '待审核的资讯文章', count: pendingArticles, route: '/contents' },
    { key: 'lease', title: '临期租约', description: '15 天内到期的租约，请跟进续期', count: expiringLeases, route: '/workstations/leases' },
  ]
}
