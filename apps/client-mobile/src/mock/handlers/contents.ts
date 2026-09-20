import type { Article, ArticleColumn, ArticleComment, ArticleCreatePayload, IdentityType, MySubmittedArticle, MySubmittedArticleDetail } from '@/types'
import { accountByUid, articleComments, articleLikesByUid, articlePayloadById, articles, columns, enterprises, myArticlesByUid, nextMockId, nowStamp, pushNotice, trackMockEvent } from '@/mock/db'
import { permissionsOf } from '@/mock/handlers/enterprises'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'
import { formatMockDate } from '@/mock/runtime'
import { articleContentVisibleTextLength } from '@/utils/articleContent'

/* [MOCK-ONLY] 内容与投稿 handlers：SU 前缀、提交即 pending、浏览量 +1、通知触发点；
 * v34 支持审核中撤回与驳回后修改重提。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

function now(): string {
  return nowStamp()
}

/** 创建与重提共用的字段校验（代企业投稿需 article_submit 权限）。 */
function normalizeArticle(uid: string, payload: ArticleCreatePayload): { title: string; content: string; columnLabel: string } {
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
  if (articleContentVisibleTextLength(content) < 30) fail(400, '正文至少 30 字')
  return { title, content, columnLabel: columns.find((c) => c.code === payload.columnCode)?.label ?? payload.columnCode }
}

export async function fetchColumns(): Promise<ArticleColumn[]> {
  return withLatency(() => [...columns], 100)
}

/** 对客户端只下发 published（closed 已下架不可见） */
function toPublicArticle(article: (typeof articles)[number]): Article {
  const { status: _status, ...publicArticle } = article
  void _status
  return publicArticle
}

export async function fetchArticles(query: { column?: string; keyword?: string } = {}): Promise<Article[]> {
  return withLatency(() => {
    let list = articles.filter((a) => a.status === 'published').map(toPublicArticle)
    if (query.column) list = list.filter((a) => a.columnLabel === query.column)
    if (query.keyword) list = list.filter((a) => a.title.includes(query.keyword!))
    return list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  })
}

export async function fetchArticle(id: string): Promise<Article> {
  return withLatency(() => {
    const a = articles.find((x) => x.id === id && x.status === 'published')
    if (!a) fail(404, '文章不存在或未发布')
    /* v39：浏览量按浏览器 + 自然日去重（Mock 时钟口径），避免刷新即增长 */
    const viewKey = `joinyuu_article_viewed_${id}_${formatMockDate()}`
    try {
      if (localStorage.getItem(viewKey) !== '1') {
        a.views += 1
        localStorage.setItem(viewKey, '1')
      }
    } catch {
      a.views += 1
    }
    /* v38：点赞聚合（跨账号）与我的点赞状态 */
    const likeCount = Object.values(articleLikesByUid).reduce((sum, list) => sum + (list.includes(a.id) ? 1 : 0), 0)
    const uid = readPayload()?.sub
    return { ...toPublicArticle(a), commentsEnabled: a.commentsEnabled ?? true, likeCount, liked: uid ? (articleLikesByUid[uid] ?? []).includes(a.id) : false }
  }, 180)
}

/* ---------- v38 点赞与评论（[MOCK-ONLY]；接入期接 /api/app/articles/:id/likes|comments） ---------- */

export async function toggleArticleLike(articleId: string): Promise<{ liked: boolean; likeCount: number }> {
  return withLatency(() => {
    const uid = requireUid()
    const article = articles.find((item) => item.id === articleId && item.status === 'published')
    if (!article) fail(404, '文章不存在或未发布')
    const list = (articleLikesByUid[uid] ??= [])
    const index = list.indexOf(articleId)
    if (index >= 0) list.splice(index, 1)
    else list.push(articleId)
    const likeCount = Object.values(articleLikesByUid).reduce((sum, likes) => sum + (likes.includes(articleId) ? 1 : 0), 0)
    return { liked: index < 0, likeCount }
  }, 120)
}

export async function fetchArticleComments(articleId: string): Promise<ArticleComment[]> {
  return withLatency(() => {
    const article = articles.find((item) => item.id === articleId && item.status === 'published')
    if (!article) fail(404, '文章不存在或未发布')
    if (article.commentsEnabled === false) fail(409, '文章评论已关闭')
    return articleComments
      .filter((item) => item.articleId === articleId)
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
      .map((item) => ({ ...item, avatar: item.avatar ?? accountByUid(item.uid)?.avatar, identityType: item.identityType ?? 'individual' }))
  }, 140)
}

export async function createArticleComment(articleId: string, content: string, asIdentity: IdentityType = 'individual', asEnterpriseId?: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const article = articles.find((item) => item.id === articleId && item.status === 'published')
    if (!article) fail(404, '文章不存在或未发布')
    if (article.commentsEnabled === false) fail(409, '文章评论已关闭')
    const text = content.trim()
    if (text.length < 2) fail(400, '评论至少 2 个字')
    if (text.length > 200) fail(400, '评论最多 200 个字')
    const account = accountByUid(uid)
    const owned = account?.identities ?? []
    let identityType: IdentityType = 'individual'
    let identityName: string | undefined
    if (asIdentity === 'community_enterprise') {
      const row = owned.find((i) => i.type === 'community_enterprise' && i.enterpriseId === asEnterpriseId)
      if (!asEnterpriseId || !row) fail(400, '您暂未关联该身份')
      identityType = 'community_enterprise'
      identityName = row.enterpriseName
    } else if (asIdentity === 'community_individual' || asIdentity === 'external_enterprise') {
      const row = owned.find((i) => i.type === asIdentity)
      if (!row) fail(400, '您暂未关联该身份')
      identityType = asIdentity
      identityName = asIdentity === 'external_enterprise' ? row.organizationName : undefined
    }
    articleComments.unshift({
      id: nextMockId('CM'),
      articleId,
      uid,
      authorName: account?.nickname ?? uid,
      avatar: account?.avatar,
      content: text,
      at: nowStamp(),
      identityType,
      identityName,
    })
    trackMockEvent('article_comment')
  }, 160)
}

export async function createArticle(payload: ArticleCreatePayload): Promise<{ id: string }> {
  return withLatency(() => {
    const uid = requireUid()
    const { title, columnLabel } = normalizeArticle(uid, payload)
    const id = nextMockId('SU')
    const my = (myArticlesByUid[uid] ??= [])
    my.unshift({ id, title, columnLabel, status: 'pending', submittedAt: now() })
    articlePayloadById[id] = { uid, payload: structuredClone(payload) }
    /* [MOCK-ONLY] 通知触发点：投稿已提交（article_accepted 积分在审核通过时发放） */
    pushNotice(uid, { type: 'system', title: '投稿已提交', content: `「${title}」已提交审核，审核通过后转入待发布并发放积分。`, link: '/me/articles' })
    trackMockEvent('article_submit')
    return { id }
  })
}

/** 撤回审核中的投稿（pending → withdrawn）。 */
export async function withdrawArticle(id: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const item = (myArticlesByUid[uid] ?? []).find((article) => article.id === id)
    if (!item) fail(404, '投稿不存在')
    if (item.status !== 'pending') fail(409, '仅审核中的投稿可撤回')
    item.status = 'withdrawn'
  })
}

/** 修改重提：仅本人已驳回/已撤回的投稿，重提后回到待审核。 */
export async function resubmitArticle(id: string, payload: ArticleCreatePayload): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const item = (myArticlesByUid[uid] ?? []).find((article) => article.id === id)
    if (!item) fail(404, '投稿不存在')
    if (item.status !== 'rejected' && item.status !== 'withdrawn') fail(409, '仅已驳回或已撤回的投稿可修改重提')
    const { title, columnLabel } = normalizeArticle(uid, payload)
    item.title = title
    item.columnLabel = columnLabel
    item.status = 'pending'
    item.submittedAt = now()
    delete item.rejectReason
    articlePayloadById[id] = { uid, payload: structuredClone(payload) }
    pushNotice(uid, { type: 'system', title: '投稿已重新提交', content: `「${title}」已重新提交审核。`, link: '/me/articles' })
  })
}

/** 重提前回填：返回投稿原始内容（仅本人）。 */
export async function fetchMyArticlePayload(id: string): Promise<ArticleCreatePayload> {
  return withLatency(() => {
    const uid = requireUid()
    const item = (myArticlesByUid[uid] ?? []).find((article) => article.id === id)
    if (!item) fail(404, '投稿不存在')
    const record = articlePayloadById[id]
    if (!record || record.uid !== uid) fail(404, '投稿内容不存在')
    return structuredClone(record.payload)
  })
}

export async function fetchMyArticles(): Promise<MySubmittedArticle[]> {
  return withLatency(() => {
    const uid = requireUid()
    return [...(myArticlesByUid[uid] ?? [])]
  })
}

export async function fetchMyArticle(id: string): Promise<MySubmittedArticleDetail> {
  return withLatency(() => {
    const uid = requireUid()
    const item = (myArticlesByUid[uid] ?? []).find((article) => article.id === id)
    if (!item) fail(404, '投稿不存在')
    const stored = articlePayloadById[id]
    if (!stored || stored.uid !== uid) fail(404, '投稿内容不存在')
    const account = accountByUid(uid)
    return {
      ...structuredClone(item),
      authorName: account?.realName || account?.nickname || '未命名',
      content: stored.payload.content,
      summary: '',
      tags: [],
      asIdentity: stored.payload.asIdentity,
      asEnterpriseId: stored.payload.asEnterpriseId,
      identityName: stored.payload.asEnterpriseId ? enterprises.find((enterprise) => enterprise.id === stored.payload.asEnterpriseId)?.name : undefined,
    }
  })
}
