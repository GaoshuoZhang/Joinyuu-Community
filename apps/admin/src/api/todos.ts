import { httpGet } from './http'

export interface TodoSummary {
  key: string
  title: string
  description: string
  count: number
  /** 去处理跳转路由（默认视图即待办列表） */
  route: string
}

/* GET /api/admin/todos — 统一待办聚合
 * 六域待办：入驻审核 / 需求审核 / 空间预约 / 展示页发布 / 文章审核 / 临期租约（窗口取系统配置） */
export async function fetchTodos(): Promise<TodoSummary[]> {
  return httpGet<TodoSummary[]>('/todos')
}
