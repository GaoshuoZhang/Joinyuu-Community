/* M2-R R2 验收：空间预约、内容投稿与点赞、申请、首页聚合、搜索、上传（smoke 覆盖）
 * 前置：docker compose up + prisma migrate + seed；密码 user123 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost } from './helpers/app-login'
import { PrismaService } from '../src/common/prisma/prisma.service'

/* 1x1 PNG */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

describe('M2-R R2 app 空间/内容/申请/首页/搜索/上传', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    token = await appLoginAs(app, '13801210001', 'user123')
  })

  afterAll(async () => {
    await app.close()
  })

  it('首页聚合 /home 下发公告/精选/未读数', async () => {
    const res = await appGet(app, token, '/api/app/home')
    expect(res.status).toBe(200)
    expect(res.body.data.siteName).toBeTruthy()
    expect(Array.isArray(res.body.data.announcements)).toBe(true)
    expect(res.body.data.announcements.length).toBeLessThanOrEqual(1)
    expect(Array.isArray(res.body.data.hotEvents)).toBe(true)
    for (const event of res.body.data.hotEvents) expect(event).not.toHaveProperty('enrolled')
    expect(typeof res.body.data.noticesUnread).toBe('number')
  })

  it('搜索聚合返回分类计数', async () => {
    const res = await appGet(app, token, '/api/app/search?keyword=%E7%A4%BE%E5%8C%BA')
    expect(res.status).toBe(200)
    expect(res.body.data.counts).toBeTruthy()
    expect(typeof res.body.data.counts.demand).toBe('number')
  })

  it('空间：可预约列表 + 我预约 + 取消', async () => {
    const list = await appGet(app, token, '/api/app/spaces')
    expect(list.status).toBe(200)
    const space = Array.isArray(list.body.data) ? list.body.data[0] : list.body.data.list?.[0]
    if (!space) return
    const availability = await appGet(app, token, `/api/app/spaces/${space.id}/availability?date=2026-10-10`)
    expect(availability.status).toBe(200)
    expect(Array.isArray(availability.body.data)).toBe(true)

    const create = await appPost(app, token, '/api/app/spaces/reservations', {
      spaceId: space.id,
      date: '2026-10-10',
      start: '10:00',
      end: '11:00',
      topic: 'R2 测试预约',
      attendees: 4,
      asIdentity: 'community_individual',
    })
    // 冲突 409 / 规则 400 / 成功 200 均可接受（依赖空间规则与占用）
    expect(create.status).toBeLessThan(500)

    const mine = await appGet(app, token, '/api/app/me/reservations')
    expect(mine.status).toBe(200)
    const reservation = mine.body.data.find((item: { id: string }) => item.id)
    if (reservation) {
      const detail = await appGet(app, token, `/api/app/me/reservations/${reservation.id}`)
      expect(detail.status).toBe(200)
      expect(detail.body.data).toEqual(expect.objectContaining({
        id: reservation.id,
        purpose: expect.any(String),
        attendees: expect.any(Number),
        records: expect.any(Array),
      }))
      const other = await appLoginAs(app, '13801210005', 'user123')
      expect((await appGet(app, other, `/api/app/me/reservations/${reservation.id}`)).status).toBe(404)
    }
  })

  it('文章：列表/详情浏览量/投稿/我的投稿/点赞', async () => {
    const arts = await appGet(app, token, '/api/app/articles')
    expect(arts.status).toBe(200)
    const articles = Array.isArray(arts.body.data) ? arts.body.data : arts.body.data.list
    expect(articles.length).toBeGreaterThan(0)

    const detail = await appGet(app, token, `/api/app/articles/${articles[0].id}`)
    expect(detail.status).toBe(200)
    expect(typeof detail.body.data.views).toBe('number')

    const posted = await appPost(app, token, '/api/app/articles', {
      title: 'R2 测试投稿',
      columnId: 'CL2001',
      summary: '测试摘要',
      content: '<p>正文</p>',
      tags: ['测试'],
      asIdentity: 'individual',
    })
    expect(posted.status).toBe(200)
    const articleId: string = posted.body.data.id

    const mine = await appGet(app, token, '/api/app/me/articles')
    const mineArts = Array.isArray(mine.body.data) ? mine.body.data : mine.body.data.list
    expect(mineArts.some((a: { id: string }) => a.id === articleId)).toBe(true)

    const ownDetail = await appGet(app, token, `/api/app/me/articles/${articleId}`)
    expect(ownDetail.status).toBe(200)
    expect(ownDetail.body.data).toEqual(expect.objectContaining({
      id: articleId,
      content: '<p>正文</p>',
      status: 'pending',
    }))
    const other = await appLoginAs(app, '13801210005', 'user123')
    expect((await appGet(app, other, `/api/app/me/articles/${articleId}`)).status).toBe(404)

    const like = await appPost(app, token, `/api/app/articles/${detail.body.data.id}/likes/toggle`, {})
    expect(like.status).toBe(200)
    expect(typeof like.body.data.likeCount).toBe('number')
  })

  it('文章关闭评论后 DTO 下发 false，评论 GET/POST 均返回 409', async () => {
    const prisma = app.get(PrismaService)
    const article = await prisma.article.findFirstOrThrow({ where: { status: 'published', deletedAt: null } })
    await prisma.article.update({
      where: { id: article.id },
      data: { commentsEnabled: false } as never,
    })

    const detail = await appGet(app, token, `/api/app/articles/${article.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.commentsEnabled).toBe(false)
    expect((await appGet(app, token, `/api/app/articles/${article.id}/comments`)).status).toBe(409)
    expect((await appPost(app, token, `/api/app/articles/${article.id}/comments`, { content: '不应创建的评论' })).status).toBe(409)
  })

  it('App 上传图片 → 公开文件路由可读取（App 上传不落素材库）', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/app/uploads')
      .set('Authorization', `Bearer ${token}`)
      .field('bizType', 'article')
      .attach('file', PNG, { filename: '配图.png', contentType: 'image/png' })
    expect(upload.status).toBe(200)
    const url = upload.body.data.url as string
    expect(url).toContain('/api/public/files/')

    const file = await request(app.getHttpServer()).get(url)
    expect(file.status).toBe(200)
    expect(file.headers['content-type']).toContain('image/png')
    expect(file.headers['x-content-type-options']).toBe('nosniff')

    /* 未知键与路径穿越均不泄露文件 */
    expect((await request(app.getHttpServer()).get('/api/public/files/not-exist.png')).status).toBe(404)
    expect((await request(app.getHttpServer()).get('/api/public/files/..%2Fsecret.png')).status).toBe(404)
  })

  it('申请：schema 下发 + 提交 + 我的申请', async () => {
    const individual = await appLoginAs(app, '13801210005', 'user123')
    const schema = await appGet(app, individual, '/api/app/application-form/individual')
    expect(schema.status).toBe(200)
    expect(Array.isArray(schema.body.data.fields)).toBe(true)

    const unverified = await appLoginAs(app, '13801210009', 'user123')
    const blocked = await appPost(app, unverified, '/api/app/applications', {
      type: 'individual',
      fields: { realName: '白若溪', skills: '材料研发', years: 3, intro: '人才登记测试', contactPhone: '13801210009' },
    })
    expect(blocked.status).toBe(403)
    expect(blocked.body.message).toBe('完成实名认证后才能提交人才登记')

    const submit = await appPost(app, token, '/api/app/applications', {
      type: 'individual',
      fields: {
        realName: '陈屿',
        skills: '产品设计',
        years: 5,
        intro: 'R2 测试简历',
        contactPhone: '13801210001',
      },
      identityType: 'community_individual',
    })
    expect(submit.status).toBe(200)

    const mine = await appGet(app, token, '/api/app/me/applications')
    expect(mine.status).toBe(200)
    const applicationId: string = submit.body.data.id
    const detail = await appGet(app, token, `/api/app/me/applications/${applicationId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'skills', label: '擅长领域', value: '产品设计' }),
    ]))
    expect(detail.body.data.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'submit', title: '提交申请' }),
    ]))
    const other = await appLoginAs(app, '13801210005', 'user123')
    expect((await appGet(app, other, `/api/app/me/applications/${applicationId}`)).status).toBe(404)
  })
})
