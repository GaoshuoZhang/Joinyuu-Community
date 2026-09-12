import { apiMode, httpGet, httpPost } from './http'
import type { Article, ArticleColumn, ArticleCreatePayload, MySubmittedArticle } from '@/types'
import * as mock from '@/mock/handlers/contents'

/** GET /api/app/article-columns — 栏目列表（enabled） */
export async function fetchColumns(): Promise<ArticleColumn[]> {
  if (apiMode === 'mock') return mock.fetchColumns()
  return httpGet<ArticleColumn[]>('/article-columns')
}

/** GET /api/app/articles — 文章列表（published，栏目筛选/关键词） */
export async function fetchArticles(query: { column?: string; keyword?: string } = {}): Promise<Article[]> {
  if (apiMode === 'mock') return mock.fetchArticles(query)
  const qs = new URLSearchParams()
  if (query.column) qs.set('column', query.column)
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<Article[]>(`/articles?${qs}`)
}

/** GET /api/app/articles/:id — 详情（浏览量 +1） */
export async function fetchArticle(id: string): Promise<Article> {
  if (apiMode === 'mock') return mock.fetchArticle(id)
  return httpGet<Article>(`/articles/${id}`)
}

/** POST /api/app/articles — 投递文章（SU 前缀；提交即待审核） */
export async function createArticle(payload: ArticleCreatePayload): Promise<{ id: string }> {
  if (apiMode === 'mock') return mock.createArticle(payload)
  return httpPost<{ id: string }>('/articles', payload)
}

/** GET /api/app/me/articles — 我的投稿（含驳回原因，可再提交） */
export async function fetchMyArticles(): Promise<MySubmittedArticle[]> {
  if (apiMode === 'mock') return mock.fetchMyArticles()
  return httpGet<MySubmittedArticle[]>('/me/articles')
}
