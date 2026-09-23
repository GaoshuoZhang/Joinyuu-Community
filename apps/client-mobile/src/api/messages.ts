import { httpGet, httpPost } from './http'
import type { MyMessage } from '@/types'

/** 用户留言（登录用户向社区留言并查看回复）。 */

/** POST /api/app/me/messages — 提交留言 */
export async function createMessage(title: string, content: string): Promise<{ id: string }> {
  return httpPost<{ id: string }>('/me/messages', { title, content })
}

/** GET /api/app/me/messages — 我的留言（含后台回复内容与时间） */
export async function fetchMyMessages(): Promise<{ list: MyMessage[]; total: number }> {
  return httpGet<{ list: MyMessage[]; total: number }>('/me/messages')
}
