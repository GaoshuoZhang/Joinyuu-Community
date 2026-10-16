import type {
  PageResult,
  Article,
  ArticleChannel,
  ArticleColumn,
} from '@/types'
import { httpDelete, httpGet, httpPost, httpPut } from './http'

export interface ArticleReadStats {
  list: Article[]
  total: number
  summary: { totalViews: number; articleCount: number; averageViews: number; topViews: number }
}
export function fetchArticleReadStats(page: number, pageSize: number): Promise<ArticleReadStats> {
  return httpGet(`/contents/read-stats?page=${page}&pageSize=${pageSize}`)
}

/* ---------- 文章管理（/api/admin/contents/articles）
 * 要点：
 * - 文章分来源：channel=official 社区自行发布（资讯发布）/ submitted 用户投稿（投稿内容）
 * - 状态机：pending 待审核 / rejected 已驳回 / pending_release 待发布 / scheduled 定时发布中 / published 已发布
 * - 栏目单选（契约仍以 columnIds 数组承载，取首项）
 * - 正文 content 富文本 HTML（写入时后端统一 sanitize）
 * - 定时发布 scheduledAt（后端定时任务到点自动发布） ---------- */

export interface ArticleQuery {
  page: number
  pageSize: number
  keyword?: string
  channel?: ArticleChannel
  columnId?: string
  /** 状态筛选：支持单值（旧调用）与多值（勾选式筛选）。
   *  多选值中的空串占位表示「不按状态过滤」（保证该字段在 URL 中可往返），落库请求会被服务端忽略 */
  status?: string | string[]
  /** 排序字段：id | views | createdAt */
  sortBy?: 'id' | 'views' | 'createdAt'
  /** 排序方向：descend 默认 | ascend */
  sortOrder?: 'ascend' | 'descend'
}

export interface ArticlePayload {
  title: string
  /** 所属栏目（单选；契约仍以数组承载） */
  columnIds: string[]
  /** 投稿作者 ID（资讯发布可空） */
  authorId?: string
  /** 作者展示名（资讯发布未选作者默认「社区运营」） */
  authorName?: string
  summary: string
  /** 正文（富文本 HTML） */
  content: string
  tags: string[]
  commentsEnabled?: boolean
}

/** GET /api/admin/contents/articles — 列表不下发正文（content 缺省，服务端 omit），编辑/详情用 fetchArticleDetail 补齐 */
export async function fetchArticles(query: ArticleQuery): Promise<PageResult<Article>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.channel) qs.set('channel', query.channel)
  if (query.columnId) qs.set('columnId', query.columnId)
  if (query.status) {
    if (Array.isArray(query.status)) query.status.forEach((s) => qs.append('status', s))
    else qs.set('status', query.status)
  }
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<Article>>(`/contents/articles?${qs}`)
}

/** GET /api/admin/contents/articles/:id，含完整下架/恢复历史。 */
export async function fetchArticleDetail(id: string): Promise<Article> {
  return httpGet<Article>(`/contents/articles/${id}`)
}

/** POST /api/admin/contents/articles（资讯发布新增即「待发布」，投稿新增即「待审核」） */
export async function createArticle(payload: ArticlePayload, channel: ArticleChannel): Promise<Article> {
  return httpPost<Article>('/contents/articles', { ...payload, channel })
}

/** PUT /api/admin/contents/articles/:id — 编辑（待发布/定时发布中/已驳回可编辑） */
export async function updateArticle(id: string, payload: ArticlePayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/contents/articles/${id}`, payload)
}

/** PUT /api/admin/contents/articles/:id/submission — 编辑审核通过且待发布的用户投稿 */
export async function updateSubmissionArticle(id: string, payload: ArticlePayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/contents/articles/${id}/submission`, payload)
}

/** POST /api/admin/contents/articles/:id/review，入参 { approved | rejected, comment? }
 * 通过 → 待发布（pending_release）；驳回 → 已驳回（rejected）并记录原因 */
export async function reviewArticle(
  id: string,
  verdict: 'approved' | 'rejected',
  comment?: string,
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${id}/review`, { status: verdict, comment })
}

/** POST /api/admin/contents/articles/:id/publish — 待发布/定时发布中 → 已发布 */
export async function publishArticleNow(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${id}/publish`)
}

/** POST /api/admin/contents/articles/:id/schedule，入参 { scheduledAt } — 待发布 → 定时发布中 */
export async function scheduleArticle(id: string, scheduledAt: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${id}/schedule`, { scheduledAt })
}

/** POST /api/admin/contents/articles/:id/cancel-schedule — 定时发布中 → 待发布 */
export async function cancelArticleSchedule(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${id}/cancel-schedule`)
}

/** POST /api/admin/contents/articles/:id/withdraw — 已发布 → 已关闭 */
export async function withdrawArticle(id: string, takedownReason?: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${id}/withdraw`, { takedownReason })
}

/** POST /api/admin/contents/articles/:id/restore — 恢复管理员主动下架的文章。 */
export async function restoreArticle(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${id}/restore`)
}

/** DELETE /api/admin/contents/articles/:id（仅待审核/已驳回投稿可删） */
export async function deleteArticle(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/contents/articles/${id}`)
}

/** 文章编辑弹窗的栏目选项（单选；系统保留栏目「未指定」不出现在发布/投稿选择中） */
export async function fetchArticleColumns(): Promise<ArticleColumn[]> {
  const columns = await httpGet<ArticleColumn[]>('/contents/columns')
  return columns.filter((c) => c.status === 'enabled' && !c.system)
}

/* ---------- 评论治理（/api/admin/contents/articles/:id/comments） ---------- */

export interface ArticleCommentItem {
  id: string
  articleId: string
  uid: string
  userName: string
  nickname: string
  /** 评论作者真实姓名（来自账号；与昵称、UID 一起用于区分同名用户） */
  realName?: string
  avatar?: string
  content: string
  at: string
  identityType: string
  identityName?: string
}

export interface ArticleCommentsResult {
  articleId: string
  commentsEnabled: boolean
  list: ArticleCommentItem[]
}

/** GET /api/admin/contents/articles/:id/comments — 文章评论（含发表身份快照） */
export async function fetchArticleComments(articleId: string): Promise<ArticleCommentsResult> {
  return httpGet<ArticleCommentsResult>(`/contents/articles/${articleId}/comments`)
}

/** POST /api/admin/contents/articles/:id/comments/:commentId/remove — 治理性删除评论（原因非空时通知作者） */
export async function removeArticleComment(
  articleId: string,
  commentId: string,
  reason?: string,
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${articleId}/comments/${commentId}/remove`, {
    takedownReason: reason,
  })
}

/* ---------- 栏目管理（/api/admin/contents/columns）
 * 「开放投稿」开关 submissionOpen：控制成员端该栏目是否可投稿 ---------- */

export interface ColumnPayload {
  name: string
  description: string
  sort: number
  /** 是否开放用户投稿 */
  submissionOpen: boolean
}

/** GET /api/admin/contents/columns — 栏目列表（按 sort 升序） */
export async function fetchColumns(): Promise<ArticleColumn[]> {
  return httpGet<ArticleColumn[]>('/contents/columns')
}

/** POST /api/admin/contents/columns — 新增栏目（新增即启用） */
export async function createColumn(payload: ColumnPayload): Promise<ArticleColumn> {
  return httpPost<ArticleColumn>('/contents/columns', payload)
}

/** PUT /api/admin/contents/columns/:id — 编辑栏目（改名时后端同步刷新文章冗余 columnName） */
export async function updateColumn(id: string, payload: ColumnPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/contents/columns/${id}`, payload)
}

/** POST /api/admin/contents/columns/:id/toggle-status — 启用/停用 */
export async function toggleColumnStatus(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/columns/${id}/toggle-status`)
}

/** POST /api/admin/contents/columns/:id/toggle-submission — 开放/关闭投稿 */
export async function toggleColumnSubmission(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/columns/${id}/toggle-submission`)
}

/** DELETE /api/admin/contents/columns/:id — 删除栏目，其文章自动转移到「未指定」栏目 */
export async function deleteColumn(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/contents/columns/${id}`)
}
