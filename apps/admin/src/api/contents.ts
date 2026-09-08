import type {
  PageResult,
  Article,
  ArticleColumn,
  ShowcaseRequest,
  ApprovalRecord,
  UserIdentity,
} from '@/types'
import { articles, columns, showcaseRequests, users } from '@/mock'
import { delay } from './utils'
import { reviewShowcase } from './enterprises'

/* 数据一致性约定：
 * - 展示页申请审批通过/驳回 → 联动企业 showcaseStatus（published/rejected），复用 enterprises.reviewShowcase
 * - 文章 columnName 为冗余快照，栏目改名时同步刷新
 * - 展示页发布申请迁移自 applications 的 showcase 类型（SC 前缀，记录 ApprovalRecord 时间线） */

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function formatToday(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

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

/* TODO: 替换为 GET /api/admin/contents/articles?page&pageSize&keyword&columnId&status */
export async function fetchArticles(query: ArticleQuery): Promise<PageResult<Article>> {
  await delay(400)
  let list = [...articles]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter(
      (a) => a.title.toLowerCase().includes(kw) || a.authorName.toLowerCase().includes(kw) || a.id.toLowerCase().includes(kw),
    )
  }
  if (query.columnId) list = list.filter((a) => a.columnId === query.columnId)
  if (query.status) list = list.filter((a) => a.status === query.status)
  const field = query.sortBy ?? 'id'
  const dir = query.sortOrder === 'ascend' ? 1 : -1
  list.sort((a, b) => {
    const av = field === 'id' ? Number(a.id.replace('A', '')) : field === 'views' ? a.views : a.createdAt
    const bv = field === 'id' ? Number(b.id.replace('A', '')) : field === 'views' ? b.views : b.createdAt
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

export interface ArticlePayload {
  title: string
  columnId: string
  authorId: string
  summary: string
  tags: string[]
}

/* TODO: 替换为 POST /api/admin/contents/articles — 创建文章（创建即草稿；作者身份快照取自用户当前身份） */
export async function createArticle(payload: ArticlePayload): Promise<Article> {
  await delay(500)
  const column = columns.find((c) => c.id === payload.columnId)
  if (!column) throw new Error('所属栏目不存在')
  const author = users.find((u) => u.uid === payload.authorId)
  if (!author) throw new Error('作者用户不存在')
  const identity: UserIdentity | null =
    author.identities.find((i) => i.type === 'community_individual') ??
    author.identities.find((i) => i.type === 'individual') ??
    null
  const maxNum = articles.reduce((m, a) => Math.max(m, Number(a.id.replace('A', ''))), 0)
  const article: Article = {
    id: `A${maxNum + 1}`,
    title: payload.title,
    columnId: column.id,
    columnName: column.name,
    authorId: author.uid,
    authorName: author.nickname,
    authorIdentity: identity,
    status: 'draft',
    views: 0,
    summary: payload.summary,
    tags: payload.tags,
    createdAt: formatNow(),
  }
  articles.push(article)
  return article
}

/* TODO: 替换为 PUT /api/admin/contents/articles/:id — 编辑文章（仅草稿/已驳回/已下架可编辑；已发布改稿 M1 支持） */
export async function updateArticle(id: string, payload: ArticlePayload): Promise<{ code: number }> {
  await delay(400)
  const article = articles.find((a) => a.id === id)
  if (!article) throw new Error('文章不存在')
  if (article.status !== 'draft' && article.status !== 'rejected' && article.status !== 'withdrawn')
    throw new Error('仅草稿、已驳回或已下架的文章可编辑')
  const column = columns.find((c) => c.id === payload.columnId)
  if (!column) throw new Error('所属栏目不存在')
  article.title = payload.title
  article.columnId = column.id
  article.columnName = column.name
  article.summary = payload.summary
  article.tags = payload.tags
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/contents/articles/:id/submit — 提交审核：草稿/已驳回/已下架 → 待审核 */
export async function submitArticle(id: string): Promise<{ code: number }> {
  await delay(350)
  const article = articles.find((a) => a.id === id)
  if (!article) throw new Error('文章不存在')
  if (article.status !== 'draft' && article.status !== 'rejected' && article.status !== 'withdrawn')
    throw new Error('仅草稿、已驳回或已下架的文章可提交审核')
  article.status = 'pending'
  delete article.rejectedReason
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/contents/articles/:id/review，入参 { status: approved | rejected, comment? } */
export async function reviewArticle(
  id: string,
  status: 'approved' | 'rejected',
  comment?: string,
): Promise<{ code: number }> {
  await delay(400)
  const article = articles.find((a) => a.id === id)
  if (!article) throw new Error('文章不存在')
  if (article.status !== 'pending') throw new Error('仅待审核文章可审批')
  if (status === 'approved') {
    article.status = 'published'
    article.publishedAt = formatNow()
  } else {
    article.status = 'rejected'
    article.rejectedReason = comment ?? ''
  }
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/contents/articles/:id/withdraw — 已发布 → 已下架 */
export async function withdrawArticle(id: string): Promise<{ code: number }> {
  await delay(350)
  const article = articles.find((a) => a.id === id)
  if (!article) throw new Error('文章不存在')
  if (article.status !== 'published') throw new Error('仅已发布文章可下架')
  article.status = 'withdrawn'
  return { code: 0 }
}

/* ---------- 栏目管理 ---------- */

export interface ColumnPayload {
  name: string
  description: string
  sort: number
}

/* TODO: 替换为 GET /api/admin/contents/columns — 栏目列表（按 sort 升序） */
export async function fetchColumns(): Promise<ArticleColumn[]> {
  await delay(300)
  return [...columns].sort((a, b) => a.sort - b.sort)
}

/* TODO: 替换为 POST /api/admin/contents/columns — 创建栏目（创建即启用） */
export async function createColumn(payload: ColumnPayload): Promise<ArticleColumn> {
  await delay(450)
  if (columns.some((c) => c.name === payload.name.trim())) throw new Error('栏目名称已存在')
  const maxNum = columns.reduce((m, c) => Math.max(m, Number(c.id.replace('CL', ''))), 0)
  const column: ArticleColumn = {
    id: `CL${maxNum + 1}`,
    name: payload.name,
    description: payload.description,
    sort: payload.sort,
    status: 'enabled',
    createdAt: formatToday(),
  }
  columns.push(column)
  return column
}

/* TODO: 替换为 PUT /api/admin/contents/columns/:id — 编辑栏目（改名时同步刷新文章冗余 columnName） */
export async function updateColumn(id: string, payload: ColumnPayload): Promise<{ code: number }> {
  await delay(400)
  const column = columns.find((c) => c.id === id)
  if (!column) throw new Error('栏目不存在')
  if (columns.some((c) => c.id !== id && c.name === payload.name.trim()))
    throw new Error('栏目名称已存在')
  const oldName = column.name
  column.name = payload.name
  column.description = payload.description
  column.sort = payload.sort
  if (oldName !== column.name) {
    for (const a of articles) if (a.columnId === column.id) a.columnName = column.name
  }
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/contents/columns/:id/toggle-status — 启用/停用（停用后新文章不可选择该栏目） */
export async function toggleColumnStatus(id: string): Promise<{ code: number }> {
  await delay(350)
  const column = columns.find((c) => c.id === id)
  if (!column) throw new Error('栏目不存在')
  column.status = column.status === 'enabled' ? 'disabled' : 'enabled'
  return { code: 0 }
}

/* ---------- 展示页发布申请（迁移自申请审批） ---------- */

export interface ShowcaseQuery {
  page: number
  pageSize: number
  targetType?: string
  status?: string
}

/* TODO: 替换为 GET /api/admin/contents/showcase-requests?page&pageSize&targetType&status */
export async function fetchShowcaseRequests(query: ShowcaseQuery): Promise<PageResult<ShowcaseRequest>> {
  await delay(400)
  let list = [...showcaseRequests]
  if (query.targetType) list = list.filter((r) => r.targetType === query.targetType)
  if (query.status) list = list.filter((r) => r.status === query.status)
  list.sort((a, b) => Number(b.id.replace('SC', '')) - Number(a.id.replace('SC', '')))
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 POST /api/admin/contents/showcase-requests/:id/review，入参 { status: approved | rejected, comment? }
 * 企业目标：审批结果联动企业展示页状态（复用 POST /api/admin/enterprises/:id/showcase-review）；
 * 个人目标：M0 仅记录审批结果，M1 接入个人主页实体 */
export async function reviewShowcaseRequest(
  id: string,
  status: 'approved' | 'rejected',
  comment?: string,
): Promise<{ code: number }> {
  await delay(450)
  const request = showcaseRequests.find((r) => r.id === id)
  if (!request) throw new Error('展示页申请不存在')
  if (request.status !== 'pending') throw new Error('该申请已处理，请勿重复审批')
  request.status = status
  if (status === 'rejected') request.rejectReason = comment ?? ''
  const record: ApprovalRecord = {
    step: '管理员审批',
    operator: '社区管理员',
    action: status === 'approved' ? 'approve' : 'reject',
    comment: comment ?? (status === 'approved' ? '审核通过' : ''),
    at: formatNow(),
  }
  request.records.push(record)
  if (request.targetType === 'enterprise' && request.targetId) {
    await reviewShowcase(request.targetId, status === 'approved' ? 'published' : 'rejected', comment)
  }
  return { code: 0 }
}
