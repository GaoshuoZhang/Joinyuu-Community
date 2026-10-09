import { describe, expect, it } from 'vitest'
import { documentTitleFor, pageTitleFor, type PageTitleRoute } from './pageTitles'

function route(name: string, query: PageTitleRoute['query'] = {}): PageTitleRoute {
  return { name, query }
}

describe('pageTitleFor', () => {
  it('distinguishes list, detail, reservation, and guest routes by route name', () => {
    expect(pageTitleFor(route('demand-detail'))).toBe('需求详情')
    expect(pageTitleFor(route('event-detail'))).toBe('活动详情')
    expect(pageTitleFor(route('article-detail'))).toBe('文章详情')
    expect(pageTitleFor(route('mall-detail'))).toBe('商品详情')
    expect(pageTitleFor(route('talent-card'))).toBe('个人名片')
    expect(pageTitleFor(route('enterprise-showcase'))).toBe('企业名片')
    expect(pageTitleFor(route('my-order-detail'))).toBe('订单详情')
    expect(pageTitleFor(route('my-project-detail'))).toBe('项目详情')
    expect(pageTitleFor(route('spaces'))).toBe('空间预约')
    expect(pageTitleFor(route('space-reserve'))).toBe('预约提交')
    expect(pageTitleFor(route('me-reservations'))).toBe('我的预约')
    expect(pageTitleFor(route('my-reservation-detail'))).toBe('预约详情')
    expect(pageTitleFor(route('me-leases'))).toBe('工位租约')
    expect(pageTitleFor(route('my-article-detail'))).toBe('投稿详情')
    expect(pageTitleFor(route('my-application-detail'))).toBe('申请详情')
    expect(pageTitleFor(route('login'))).toBe('登录')
    expect(pageTitleFor(route('register'))).toBe('注册')
    expect(pageTitleFor(route('forgot-password'))).toBe('找回密码')
  })

  it('titles tab roots and their query-selected views', () => {
    expect(pageTitleFor(route('home'))).toBe('首页')
    expect(pageTitleFor(route('projects'))).toBe('需求')
    expect(pageTitleFor(route('projects', { kind: 'investment' }))).toBe('找投资')
    expect(pageTitleFor(route('community', { tab: 'talent' }))).toBe('人才库')
    expect(pageTitleFor(route('plaza', { tab: 'articles' }))).toBe('资讯')
    expect(pageTitleFor(route('plaza', { tab: 'events' }))).toBe('活动')
    expect(pageTitleFor(route('me'))).toBe('我的')
  })

  it('falls back to the route title for unsupported query values', () => {
    expect(pageTitleFor(route('community', { tab: 'unknown' }))).toBe('社区')
    expect(pageTitleFor({ name: 'missing', query: {} })).toBe('')
  })
})

describe('documentTitleFor', () => {
  it('keeps the configured site name in document titles', () => {
    expect(documentTitleFor(route('event-detail'), '创客社区')).toBe('活动详情 · 创客社区')
    expect(documentTitleFor(route('home'), '创客社区')).toBe('首页 · 创客社区')
    expect(documentTitleFor({ name: 'missing' }, '创客社区')).toBe('创客社区')
  })
})
