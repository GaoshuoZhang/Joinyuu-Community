import { httpGet, httpPost } from './http'
import type { PageResult } from '@/types'

/* 用户留言（/api/admin/user-messages）：查看客户端留言并回复 */

export interface UserMessageRow {
  id: string
  userId: string
  /** 留言人展示名（真实姓名优先，其次昵称） */
  userName: string
  userPhone?: string
  title: string
  content: string
  status: 'pending' | 'replied'
  createdAt: string
  replyContent?: string
  repliedAt?: string
  /** 回复人（后台工作人员姓名） */
  repliedBy?: string
}

/* GET /api/admin/user-messages?page&pageSize&status&keyword&sortBy&sortOrder
 * 省略 sortBy 时按「待回复置顶 + 提交时间倒序」；sortBy=createdAt 时纯按提交时间排序 */
export async function fetchUserMessages(query: {
  page: number
  pageSize: number
  status?: string
  keyword?: string
  sortBy?: 'createdAt'
  sortOrder?: 'ascend' | 'descend'
}): Promise<PageResult<UserMessageRow>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.status) qs.set('status', query.status)
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<UserMessageRow>>(`/user-messages?${qs}`)
}

/* POST /api/admin/user-messages/:id/reply — 回复留言（回复后向留言人推送站内信） */
export async function replyUserMessage(id: string, content: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/user-messages/${id}/reply`, { content })
}

/* POST /api/admin/user-messages/:id/archive — 归档留言（仅已回复；可在归档管理中恢复） */
export async function archiveUserMessage(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/user-messages/${id}/archive`)
}
