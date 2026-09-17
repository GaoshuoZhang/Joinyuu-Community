/* 首页轮播图与文章评论开关验收：
 * - 后台轮播图 CRUD / 排序 / 启停 + RBAC
 * - 客户端首页仅下发启用条目，总开关关闭时整块区域关闭
 * - 文章评论开关默认开启，关闭后客户端读写均被拒绝 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { appGet, appLoginAs, appPost } from './helpers/app-login'

describe('首页轮播图与文章评论开关', () => {
  let app: INestApplication
  let db: PrismaService
  let admin: string
  let auditor: string
  let user: string

  beforeAll(async () => {
    reseed()
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication()
    await app.init()
    db = app.get(PrismaService)
    admin = await loginAs(app)
    auditor = await loginAs(app, 'auditor')
    user = await appLoginAs(app, '13801210001', 'user123')
  })
  afterAll(async () => { await app?.close() })

  const get = (path: string, token = admin) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)
  const post = (path: string, body: object = {}, token = admin) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send(body)
  const put = (path: string, body: object = {}, token = admin) => request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${token}`).send(body)
  const del = (path: string, token = admin) => request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`)

  it('轮播图列表按 sort 升序，权限隔离生效', async () => {
    const list = await get('/api/admin/contents/banners')
    expect(list.status).toBe(200)
    const sorts = (list.body.data as Array<{ sort: number }>).map((b) => b.sort)
    expect(sorts).toEqual([...sorts].sort((a, b) => a - b))
    expect(list.body.data.length).toBeGreaterThan(0)
    expect((await get('/api/admin/contents/banners', auditor)).status).toBe(403)
  })

  it('轮播图新增/编辑/启停/删除并写审计', async () => {
    const created = await post('/api/admin/contents/banners', { title: '测试轮播', subtitle: '副标题', sort: 0, enabled: true })
    expect(created.status).toBe(200)
    const id: string = created.body.data.id
    expect(id.startsWith('BN')).toBe(true)

    const list = await get('/api/admin/contents/banners')
    expect((list.body.data[0] as { id: string }).id).toBe(id)

    expect((await put(`/api/admin/contents/banners/${id}`, { title: '测试轮播改', subtitle: '', sort: 9, enabled: true })).status).toBe(200)
    const toggled = await post(`/api/admin/contents/banners/${id}/toggle-enabled`)
    expect(toggled.status).toBe(200)
    expect(toggled.body.data.enabled).toBe(false)

    const appHome = await request(app.getHttpServer()).get('/api/app/home')
    expect((appHome.body.data.banners as Array<{ id: string }>).some((b) => b.id === id)).toBe(false)

    expect((await del(`/api/admin/contents/banners/${id}`)).status).toBe(200)
    expect(await db.auditLog.count({ where: { module: '内容管理', target: { contains: id } } })).toBeGreaterThan(0)
  })

  it('关闭总开关后客户端首页不展示轮播区域', async () => {
    expect((await put('/api/admin/contents/banners/settings', { carouselOpen: false })).status).toBe(200)
    const off = await request(app.getHttpServer()).get('/api/app/home')
    expect(off.body.data.carouselEnabled).toBe(false)
    expect(off.body.data.banners).toEqual([])

    expect((await put('/api/admin/contents/banners/settings', { carouselOpen: true })).status).toBe(200)
    const on = await request(app.getHttpServer()).get('/api/app/home')
    expect(on.body.data.carouselEnabled).toBe(true)
    expect((on.body.data.banners as unknown[]).length).toBeGreaterThan(0)
    expect((await get('/api/admin/contents/banners/settings')).body.data.carouselOpen).toBe(true)
  })

  it('文章评论默认开启；关闭后客户端评论读写被拒', async () => {
    const article = await db.article.findFirstOrThrow({ where: { status: 'published', deletedAt: null } })
    expect((await appGet(app, user, `/api/app/articles/${article.id}`)).body.data.commentsEnabled).toBe(true)
    expect((await appGet(app, user, `/api/app/articles/${article.id}/comments`)).status).toBe(200)

    await db.article.update({ where: { id: article.id }, data: { commentsEnabled: false } })
    expect((await appGet(app, user, `/api/app/articles/${article.id}`)).body.data.commentsEnabled).toBe(false)
    expect((await appGet(app, user, `/api/app/articles/${article.id}/comments`)).status).toBe(409)
    expect((await appPost(app, user, `/api/app/articles/${article.id}/comments`, { content: '关闭后不应写入' })).status).toBe(409)
  })
})
