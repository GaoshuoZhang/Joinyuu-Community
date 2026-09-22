import { httpDelete, httpGet, httpPost } from './http'
import type { Article, ArticleColumn, ArticleComment, ArticleCreatePayload, IdentityType, MySubmittedArticle, MySubmittedArticleDetail } from '@/types'

/** GET /api/app/article-columns — 栏目列表（enabled） */
export async function fetchColumns(): Promise<ArticleColumn[]> {
  return httpGet<ArticleColumn[]>('/article-columns')
}

/** GET /api/app/articles — 文章列表（published，栏目筛选/关键词） */
export async function fetchArticles(query: { column?: string; keyword?: string } = {}): Promise<Article[]> {
  const qs = new URLSearchParams()
  if (query.column) qs.set('column', query.column)
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<Article[]>(`/articles?${qs}`)
}

/** GET /api/app/articles/:id — 详情（浏览量 +1） */
export async function fetchArticle(id: string): Promise<Article> {
  return httpGet<Article>(`/articles/${id}`)
}

/** 点赞 / 取消点赞。 */
export async function toggleArticleLike(articleId: string): Promise<{ liked: boolean; likeCount: number }> {
  return httpPost<{ liked: boolean; likeCount: number }>(`/articles/${articleId}/likes/toggle`)
}

/** 评论列表。 */
export async function fetchArticleComments(articleId: string): Promise<ArticleComment[]> {
  return httpGet<ArticleComment[]>(`/articles/${articleId}/comments`)
}

/** 发表评论（可选发表身份）。 */
export async function createArticleComment(articleId: string, content: string, asIdentity?: IdentityType, asEnterpriseId?: string): Promise<void> {
  await httpPost(`/articles/${articleId}/comments`, { content, asIdentity, asEnterpriseId })
}

/** 删除自己的评论。 */
export async function deleteArticleComment(articleId: string, commentId: string): Promise<void> {
  await httpDelete(`/articles/${articleId}/comments/${commentId}`)
}

/** POST /api/app/articles — 投递文章（SU 前缀；提交即待审核） */
export async function createArticle(payload: ArticleCreatePayload): Promise<{ id: string }> {
  return httpPost<{ id: string }>('/articles', payload)
}

/** GET /api/app/me/articles — 我的投稿（含驳回原因，可再提交） */
export async function fetchMyArticles(): Promise<MySubmittedArticle[]> {
  return httpGet<MySubmittedArticle[]>('/me/articles')
}

/** GET /api/app/me/articles/:id — 本人的投稿详情（含未发布状态）。 */
export async function fetchMyArticle(id: string): Promise<MySubmittedArticleDetail> {
  return httpGet<MySubmittedArticleDetail>(`/me/articles/${id}`)
}

/** 撤回审核中的投稿。 */
export async function withdrawArticle(id: string): Promise<void> {
  await httpPost(`/me/articles/${id}/withdraw`)
}

/** 驳回/撤回后修改重提（保留原投稿编号）。 */
export async function resubmitArticle(id: string, payload: ArticleCreatePayload): Promise<void> {
  await httpPost(`/me/articles/${id}/resubmit`, payload)
}

/** 重提前回填投稿原始内容。 */
export async function fetchMyArticlePayload(id: string): Promise<ArticleCreatePayload> {
  return httpGet<ArticleCreatePayload>(`/me/articles/${id}/payload`)
}
