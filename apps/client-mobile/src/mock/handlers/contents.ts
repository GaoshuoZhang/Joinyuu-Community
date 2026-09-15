import type { Article, ArticleColumn, ArticleCreatePayload, MySubmittedArticle } from '@/types'
import { articles, columns, enterprises, myArticlesByUid, nowStamp, pushNotice } from '@/mock/db'
import { permissionsOf } from '@/mock/handlers/enterprises'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 内容与投稿 handlers：SU 前缀、提交即 pending、浏览量 +1、通知触发点。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

function now(): string {
  return nowStamp()
}

export async function fetchColumns(): Promise<ArticleColumn[]> {
  return withLatency(() => [...columns], 100)
}

export async function fetchArticles(query: { column?: string; keyword?: string } = {}): Promise<Article[]> {
  return withLatency(() => {
    let list = [...articles]
    if (query.column) list = list.filter((a) => a.columnLabel === query.column)
    if (query.keyword) list = list.filter((a) => a.title.includes(query.keyword!))
    return list
  })
}

export async function fetchArticle(id: string): Promise<Article> {
  return withLatency(() => {
    const a = articles.find((x) => x.id === id)
    if (!a) fail(404, '文章不存在或未发布')
    a.views += 1
    return a
  }, 180)
}

export async function createArticle(payload: ArticleCreatePayload): Promise<{ id: string }> {
  return withLatency(() => {
    const uid = requireUid()
    const title = payload.title.trim()
    const content = payload.content.trim()
    if (!title) fail(400, '请输入文章标题')
    if (!payload.columnCode) fail(400, '请选择栏目')
    if (!payload.asIdentity) fail(400, '请选择投稿身份')
    if (payload.asIdentity === 'community_enterprise' && payload.asEnterpriseId) {
      const enterprise = enterprises.find((item) => item.id === payload.asEnterpriseId)
      if (!enterprise || !enterprise.members.some((member) => member.uid === uid)) fail(403, '你不是该企业成员')
      if (!permissionsOf(enterprise, uid).includes('article_submit')) fail(403, '你没有代企业提交投稿的权限')
    }
    if (content.length < 30) fail(400, '正文至少 30 字')
    const id = `SU${Date.now()}`
    const columnLabel = columns.find((c) => c.code === payload.columnCode)?.label ?? payload.columnCode
    const my = (myArticlesByUid[uid] ??= [])
    my.unshift({ id, title, columnLabel, status: 'pending', submittedAt: now() })
    /* [MOCK-ONLY] 通知触发点：投稿已提交（article_accepted 积分在审核通过时发放） */
    pushNotice(uid, { type: 'system', title: '投稿已提交', content: `「${title}」已提交审核，审核通过后转入待发布并发放积分。`, link: '/me/articles' })
    return { id }
  })
}

export async function fetchMyArticles(): Promise<MySubmittedArticle[]> {
  return withLatency(() => {
    const uid = requireUid()
    return [...(myArticlesByUid[uid] ?? [])]
  })
}
