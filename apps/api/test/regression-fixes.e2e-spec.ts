/* 修复轮次回归（2026-09-20）：
 * O-01/O-02/O-03 分页默认值与上限、D-104 性别 code、D-105 找回密码 400、
 * C-03 评论删除（本人/管理员）、O-04 字典读权限契约、O-06 活动报名显式值。
 * 前置：docker compose up + prisma migrate + seed；用户密码 user123；admin 超管 admin/admin123 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost, fetchAppCaptcha } from './helpers/app-login'
import { loginAs } from './helpers/login'

describe('修复轮次回归：契约与功能补齐', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: string
  let operator: string
  let tokenA: string // U1001
  let tokenB: string // U1005

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    admin = await loginAs(app)
    operator = await loginAs(app, 'operator', 'admin123')
    tokenA = await appLoginAs(app, '13801210001', 'user123')
    tokenB = await appLoginAs(app, '13801210005', 'user123')
  })

  afterAll(async () => {
    await app.close()
  })

  it('O-01/O-02：后台分页缺省值为 1/10，pageSize 上限 100', async () => {
    const noParams = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${admin}`)
    expect(noParams.status).toBe(200)
    expect(noParams.body.data.list.length).toBeLessThanOrEqual(10)
    expect(noParams.body.data.total).toBe(15)

    const capped = await request(app.getHttpServer())
      .get('/api/admin/users?page=1&pageSize=101')
      .set('Authorization', `Bearer ${admin}`)
    expect(capped.status).toBe(400)
    expect(capped.body.message).toContain('不能大于 100')

    const zero = await request(app.getHttpServer())
      .get('/api/admin/users?page=0&pageSize=10')
      .set('Authorization', `Bearer ${admin}`)
    expect(zero.status).toBe(400)
  })

  it('O-03：App 列表分页非法值返回 400（与后台口径一致）', async () => {
    const demands = await appGet(app, tokenA, '/api/app/demands?page=0')
    expect(demands.status).toBe(400)
    const notices = await appGet(app, tokenA, '/api/app/notices?page=0')
    expect(notices.status).toBe(400)
    const mall = await appGet(app, tokenA, '/api/app/mall/goods?pageSize=0')
    expect(mall.status).toBe(400)
    const okDefaults = await appGet(app, tokenA, '/api/app/demands')
    expect(okDefaults.status).toBe(200)
    expect(okDefaults.body.data.list.length).toBeLessThanOrEqual(10)
  })

  it('D-104：性别读写统一为 code（兼容历史中文值）', async () => {
    const put = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ gender: '男' })
    expect(put.status).toBe(200)
    const me = await appGet(app, tokenA, '/api/app/me')
    expect(me.body.data.gender).toBe('male')

    const invalid = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ gender: 'MALE!' })
    expect(invalid.status).toBe(400)

    /* 后台编辑用户：中文/规范值均落库为 code，读取返回 code */
    const adminPut = await request(app.getHttpServer())
      .put('/api/admin/users/U1006')
      .set('Authorization', `Bearer ${admin}`)
      .send({ gender: '女' })
    expect(adminPut.status).toBe(200)
    const list = await request(app.getHttpServer())
      .get('/api/admin/users?keyword=U1006&page=1&pageSize=5')
      .set('Authorization', `Bearer ${admin}`)
    expect(list.body.data.list[0].gender).toBe('female')
  })

  it('D-105：找回密码未注册手机号返回 400（不触发客户端登出）', async () => {
    const { captchaId, captchaCode } = await fetchAppCaptcha(app)
    const res = await request(app.getHttpServer())
      .post('/api/app/auth/reset-password')
      .send({ phone: '13900009999', newPassword: 'Secret123', captchaId, captchaCode })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('该手机号未注册')
  })

  it('C-03/D-111：评论清洗、自行删除与管理员治理删除', async () => {
    const article = await prisma.article.findFirstOrThrow({
      where: { status: 'published', deletedAt: null, commentsEnabled: true },
      orderBy: { id: 'asc' },
    })
    const articleId = article.id

    /* 纯文本清洗：脚本与事件属性被剥离，仅保留文字 */
    const created = await appPost(app, tokenA, `/api/app/articles/${articleId}/comments`, {
      content: '<script>alert(1)</script><img src=x onerror=alert(2)>联调评论清洗',
    })
    expect(created.status).toBe(200)
    const commentId: string = created.body.data.id
    const comments = await appGet(app, tokenA, `/api/app/articles/${articleId}/comments`)
    const mine = comments.body.data.find((c: { id: string }) => c.id === commentId)
    expect(mine.content).not.toContain('<script')
    expect(mine.content).not.toContain('onerror')
    expect(mine.content).toContain('联调评论清洗')

    /* 他人评论不可删除（403） */
    const other = await appPost(app, tokenB, `/api/app/articles/${articleId}/comments`, { content: '他人的评论' })
    const otherId: string = other.body.data.id
    const forbidden = await request(app.getHttpServer())
      .delete(`/api/app/articles/${articleId}/comments/${otherId}`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(forbidden.status).toBe(403)

    /* 本人删除成功，重复删除 404 */
    const del = await request(app.getHttpServer())
      .delete(`/api/app/articles/${articleId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(del.status).toBe(200)
    const again = await request(app.getHttpServer())
      .delete(`/api/app/articles/${articleId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(again.status).toBe(404)

    /* 管理员治理性删除：填写原因后作者收到站内信 */
    const before = await prisma.userNotification.count({ where: { userId: 'U1005', title: { startsWith: '内容下架：' } } })
    const remove = await request(app.getHttpServer())
      .post(`/api/admin/contents/articles/${articleId}/comments/${otherId}/remove`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ takedownReason: '联调测试：评论违规，治理删除' })
    expect(remove.status).toBe(200)
    const after = await prisma.userNotification.count({ where: { userId: 'U1005', title: { startsWith: '内容下架：' } } })
    expect(after).toBe(before + 1)
    expect(await prisma.articleComment.findUnique({ where: { id: Number(otherId) } })).toBeNull()
  })

  it('O-04：字典读接口对所有登录管理员开放，写接口仍需 /system/dicts 权限', async () => {
    const read = await request(app.getHttpServer())
      .get('/api/admin/dicts/demand_category')
      .set('Authorization', `Bearer ${operator}`)
    expect(read.status).toBe(200)
    const write = await request(app.getHttpServer())
      .post('/api/admin/dicts/demand_category')
      .set('Authorization', `Bearer ${operator}`)
      .send({ label: '越权新增类别' })
    expect(write.status).toBe(403)
  })

  it('O-06：活动报名开关为显式值（幂等，重放不翻转）', async () => {
    const patch = (body: object) =>
      request(app.getHttpServer())
        .patch('/api/admin/events/EV6003/enrollment')
        .set('Authorization', `Bearer ${admin}`)
        .send(body)

    /* EV6003 种子 enrollmentOpen=false */
    expect((await patch({ enrollmentOpen: true })).status).toBe(200)
    expect((await patch({ enrollmentOpen: true })).status).toBe(200)
    let row = await prisma.communityEvent.findUnique({ where: { id: 'EV6003' } })
    expect(row?.enrollmentOpen).toBe(true)

    expect((await patch({ enrollmentOpen: false })).status).toBe(200)
    row = await prisma.communityEvent.findUnique({ where: { id: 'EV6003' } })
    expect(row?.enrollmentOpen).toBe(false)

    const invalid = await patch({})
    expect(invalid.status).toBe(400)
  })
})
