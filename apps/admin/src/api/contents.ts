import type {
  PageResult,
  Article,
  ArticleColumn,
  ShowcaseRequest,
} from '@/types'
import { httpGet, httpPost, httpPut } from './http'

/* ---------- 文章管理 ---------- */

export interface ArticleQuery {
  page: number
  pageSize: number
  keyword?: string
  columnId?: string
  status?: string
  /** 排序字段：id | views | createdAt */
  sortBy?: 'id' | 'views' | 'createdAt'
  /** 排序方向：descend 默认 | ascend */
  sortOrder?: 'ascend' | 'descend'
}

/* 已接入 M1 真实接口：GET /api/admin/contents/articles?page&pageSize&keyword&columnId&status&sortBy&sortOrder */
export async function fetchArticles(query: ArticleQuery): Promise<PageResult<Article>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.columnId) qs.set('columnId', query.columnId)
  if (query.status) qs.set('status', query.status)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<Article>>(`/contents/articles?${qs}`)
}

export interface ArticlePayload {
  title: string
  columnId: string
  authorId: string
  summary: string
  tags: string[]
}

/* 已接入 M1 真实接口：POST /api/admin/contents/articles — 创建文章（创建即草稿；作者身份快照取自用户当前身份） */
export async function createArticle(payload: ArticlePayload): Promise<Article> {
  return httpPost<Article>('/contents/articles', payload)
}

/* 已接入 M1 真实接口：PUT /api/admin/contents/articles/:id — 编辑文章（仅草稿/已驳回/已下架可编辑；已发布改稿 M1 支持） */
export async function updateArticle(id: string, payload: ArticlePayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/contents/articles/${id}`, payload)
}

/* 已接入 M1 真实接口：POST /api/admin/contents/articles/:id/submit — 提交审核：草稿/已驳回/已下架 → 待审核 */
export async function submitArticle(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${id}/submit`)
}

/* 已接入 M1 真实接口：POST /api/admin/contents/articles/:id/review，入参 { status: approved | rejected, comment? } */
export async function reviewArticle(
  id: string,
  status: 'approved' | 'rejected',
  comment?: string,
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${id}/review`, { status, comment })
}

/* 已接入 M1 真实接口：POST /api/admin/contents/articles/:id/withdraw — 已发布 → 已下架 */
export async function withdrawArticle(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/articles/${id}/withdraw`)
}

/* ---------- 栏目管理 ---------- */

export interface ColumnPayload {
  name: string
  description: string
  sort: number
}

/* 已接入 M1 真实接口：GET /api/admin/contents/columns — 栏目列表（按 sort 升序，含文章数聚合） */
export async function fetchColumns(): Promise<ArticleColumn[]> {
  return httpGet<ArticleColumn[]>('/contents/columns')
}

/* 已接入 M1 真实接口：POST /api/admin/contents/columns — 创建栏目（创建即启用） */
export async function createColumn(payload: ColumnPayload): Promise<ArticleColumn> {
  return httpPost<ArticleColumn>('/contents/columns', payload)
}

/* 已接入 M1 真实接口：PUT /api/admin/contents/columns/:id — 编辑栏目（改名时同步刷新文章冗余 columnName） */
export async function updateColumn(id: string, payload: ColumnPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/contents/columns/${id}`, payload)
}

/* 已接入 M1 真实接口：POST /api/admin/contents/columns/:id/toggle-status — 启用/停用（停用后新文章不可选择该栏目） */
export async function toggleColumnStatus(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/columns/${id}/toggle-status`)
}

/* ---------- 展示页发布申请（迁移自申请审批） ---------- */

export interface ShowcaseQuery {
  page: number
  pageSize: number
  targetType?: string
  status?: string
}

/* 已接入 M1 真实接口：GET /api/admin/contents/showcase-requests?page&pageSize&targetType&status */
export async function fetchShowcaseRequests(query: ShowcaseQuery): Promise<PageResult<ShowcaseRequest>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.targetType) qs.set('targetType', query.targetType)
  if (query.status) qs.set('status', query.status)
  return httpGet<PageResult<ShowcaseRequest>>(`/contents/showcase-requests?${qs}`)
}

/* 已接入 M1 真实接口：POST /api/admin/contents/showcase-requests/:id/review，入参 { status: approved | rejected, comment? }
 * 企业目标：审批结果联动企业展示页状态（复用 POST /api/admin/enterprises/:id/showcase-review）；
 * 个人目标：M0 仅记录审批结果，M1 接入个人主页实体 */
export async function reviewShowcaseRequest(
  id: string,
  status: 'approved' | 'rejected',
  comment?: string,
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/contents/showcase-requests/${id}/review`, { status, comment })
}
