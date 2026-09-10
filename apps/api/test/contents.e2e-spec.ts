/* M1-D 内容管理 e2e（wiki-backend.md §13 M1-D / §7.14）：
 * 覆盖：文章生命周期 draft→submit→review published + 非法编辑 409；栏目改名级联刷新 columnName；
 *       展示页审批联动企业 showcaseStatus（经 GET /enterprises/:id 断言）。
 * 前置：docker compose up + prisma migrate + seed（A1006 草稿 / CL2003 干货分享 / SC1003 待审批企业 E2004 云径网络）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'

describe('M1-D contents 内容管理（文章/栏目/展示页）', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    const login = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })
    token = login.body.data.token
  })

  afterAll(async () => {
    await app.close()
  })

  it('创建文章 → 草稿（views 0/columnName 快照）；栏目/作者不存在 → 404', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '测试文章', columnId: 'CL2003', authorId: 'U1009', summary: '摘要', tags: ['测试'] })
    expect(create.status).toBe(200)
    expect(create.body.code).toBe(0)
    expect(create.body.data.status).toBe('draft')
    expect(create.body.data.views).toBe(0)
    expect(create.body.data.id).toMatch(/^A\d+$/)
    expect(create.body.data.columnName).toBe('干货分享')

    const badColumn = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x', columnId: 'CL9999', authorId: 'U1009', summary: 'x', tags: [] })
    expect(badColumn.status).toBe(404)
    expect(badColumn.body).toEqual({ code: 404, message: '所属栏目不存在' })

    const badAuthor = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x', columnId: 'CL2003', authorId: 'U9999', summary: 'x', tags: [] })
    expect(badAuthor.status).toBe(404)
    expect(badAuthor.body).toEqual({ code: 404, message: '作者用户不存在' })
  })

  it('草稿提交审核 → 审核通过发布；已发布编辑 → 409', async () => {
    const submit = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/A1006/submit')
      .set('Authorization', `Bearer ${token}`)
    expect(submit.status).toBe(200)
    expect(submit.body).toEqual({ code: 0, data: { code: 0 } })

    const review = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/A1006/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(review.status).toBe(200)
    expect(review.body).toEqual({ code: 0, data: { code: 0 } })

    const list = await request(app.getHttpServer())
      .get('/api/admin/contents/articles')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50, keyword: 'A1006' })
    const article = list.body.data.list.find((a: { id: string }) => a.id === 'A1006')
    expect(article.status).toBe('published')
    expect(article.publishedAt).toBeTruthy()

    const edit = await request(app.getHttpServer())
      .put('/api/admin/contents/articles/A1006')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '改', columnId: 'CL2003', authorId: 'U1009', summary: '改', tags: [] })
    expect(edit.status).toBe(409)
    expect(edit.body).toEqual({ code: 409, message: '仅草稿、已驳回或已下架的文章可编辑' })
  })

  it('栏目改名 → 级联刷新该栏目文章 columnName 快照', async () => {
    const rename = await request(app.getHttpServer())
      .put('/api/admin/contents/columns/CL2003')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '干货分享（改）', description: '改', sort: 3 })
    expect(rename.status).toBe(200)
    expect(rename.body).toEqual({ code: 0, data: { code: 0 } })

    const list = await request(app.getHttpServer())
      .get('/api/admin/contents/articles')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50, columnId: 'CL2003' })
    expect(list.body.data.list.length).toBeGreaterThan(0)
    for (const a of list.body.data.list as Array<{ columnName: string }>) {
      expect(a.columnName).toBe('干货分享（改）')
    }
  })

  it('展示页审批通过 → 联动企业 showcaseStatus；重复审批 → 409', async () => {
    const review = await request(app.getHttpServer())
      .post('/api/admin/contents/showcase-requests/SC1003/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(review.status).toBe(200)
    expect(review.body).toEqual({ code: 0, data: { code: 0 } })

    const detail = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2004')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.enterprise.showcaseStatus).toBe('published')

    const again = await request(app.getHttpServer())
      .post('/api/admin/contents/showcase-requests/SC1003/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(again.status).toBe(409)
    expect(again.body).toEqual({ code: 409, message: '该申请已处理，请勿重复审批' })
  })
})
