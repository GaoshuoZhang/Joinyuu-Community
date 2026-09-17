/* M1.5 内容管理 e2e（wiki-backend.md §7.14/§8.1/§8.9 + 内容改造）：
 * 覆盖：文章状态机（official→pending_release / submitted→pending；review；publish；schedule；
 *       cancel-schedule；withdraw；软删）+ 富文本 sanitize；栏目单选/开放投稿/系统保留栏目/删除转移。
 * 前置：docker compose up + prisma migrate + seed（SU1006 待发布 / SU1007、SU1008 待审核 / SU1009 已驳回 /
 *       SU1001~SU1005 已发布 / CL2003 干货分享 / COL_NONE 未指定）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1.5 contents 内容管理（文章/栏目）', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    token = await loginAs(app)
  })

  afterAll(async () => {
    await app.close()
  })

  const auth = () => ({ Authorization: `Bearer ${token}` })
  const listArticle = async (id: string) => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/contents/articles')
      .set(auth())
      .query({ page: 1, pageSize: 50, keyword: id })
    return (res.body.data.list as Array<Record<string, unknown>>).find((a) => a.id === id)
  }

  it('新增资讯（official）→ 待发布；栏目/作者不存在 → 404；正文 <script> 被清洗', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set(auth())
      .send({
        title: '测试资讯',
        channel: 'official',
        columnIds: ['CL2003'],
        summary: '摘要',
        content: '<p>正文<script>alert(1)</script></p><img src="x" onerror="alert(2)">',
        tags: ['测试'],
      })
    expect(create.status).toBe(200)
    expect(create.body.code).toBe(0)
    expect(create.body.data.status).toBe('pending_release')
    expect(create.body.data.views).toBe(0)
    expect(create.body.data.channel).toBe('official')
    expect(create.body.data.id).toMatch(/^A\d+$/)
    expect(create.body.data.columnIds).toEqual(['CL2003'])
    expect(create.body.data.columnNames).toEqual(['干货分享'])
    expect(create.body.data.authorName).toBe('社区运营')
    expect(create.body.data.content).toContain('正文')
    expect(create.body.data.content).not.toContain('script')
    expect(create.body.data.content).not.toContain('onerror')

    const badColumn = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set(auth())
      .send({ title: 'x', channel: 'official', columnIds: ['CL9999'], summary: 'x', content: 'x', tags: [] })
    expect(badColumn.status).toBe(404)
    expect(badColumn.body).toEqual({ code: 404, message: '所属栏目不存在' })

    const badAuthor = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set(auth())
      .send({ title: 'x', channel: 'official', columnIds: ['CL2003'], authorId: 'U9999', summary: 'x', content: 'x', tags: [] })
    expect(badAuthor.status).toBe(404)
    expect(badAuthor.body).toEqual({ code: 404, message: '作者用户不存在' })
  })

  it('新增投稿（submitted）→ 待审核', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set(auth())
      .send({ title: '测试投稿', channel: 'submitted', columnIds: ['CL2003'], authorId: 'U1009', summary: '摘要', content: '<p>投稿正文</p>', tags: [] })
    expect(create.status).toBe(200)
    expect(create.body.data.status).toBe('pending')
    expect(create.body.data.channel).toBe('submitted')
    expect(create.body.data.id).toMatch(/^SU\d+$/)
    expect(create.body.data.authorId).toBe('U1009')
    expect(create.body.data.authorName).toBe('白若溪')
  })

  it('审核：通过 → 待发布；驳回需原因；重复审核 409', async () => {
    const approve = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/SU1007/review')
      .set(auth())
      .send({ status: 'approved' })
    expect(approve.status).toBe(200)
    expect(approve.body).toEqual({ code: 0, data: { code: 0 } })
    expect((await listArticle('SU1007'))?.status).toBe('pending_release')

    const noReason = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/SU1008/review')
      .set(auth())
      .send({ status: 'rejected' })
    expect(noReason.status).toBe(400)
    expect(noReason.body).toEqual({ code: 400, message: '请填写驳回原因' })

    const reject = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/SU1008/review')
      .set(auth())
      .send({ status: 'rejected', comment: '内容需补充来源' })
    expect(reject.status).toBe(200)
    const rejected = await listArticle('SU1008')
    expect(rejected?.status).toBe('rejected')
    expect(rejected?.rejectedReason).toBe('内容需补充来源')

    const again = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/SU1008/review')
      .set(auth())
      .send({ status: 'approved' })
    expect(again.status).toBe(409)
    expect(again.body).toEqual({ code: 409, message: '仅待审核的文章可审核' })
  })

  it('发布：待发布 → 已发布；重复发布 409', async () => {
    const publish = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/SU1006/publish')
      .set(auth())
    expect(publish.status).toBe(200)
    const published = await listArticle('SU1006')
    expect(published?.status).toBe('published')
    expect(published?.publishedAt).toBeTruthy()

    const again = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/SU1006/publish')
      .set(auth())
    expect(again.status).toBe(409)
    expect(again.body).toEqual({ code: 409, message: '仅待发布或定时发布中的文章可发布' })
  })

  it('定时发布任务：到点自动发布并写通知', async () => {
    const prisma = app.get(PrismaService)
    await prisma.article.update({
      where: { id: 'SU1006' },
      data: { status: 'scheduled', scheduledAt: '2020-01-01 00:00', publishedAt: null },
    })

    const run = await request(app.getHttpServer())
      .post('/api/admin/monitor/jobs/articles-scheduled-publish/run')
      .set(auth())
    expect(run.status).toBe(200)

    const published = await listArticle('SU1006')
    expect(published?.status).toBe('published')
    expect(published?.publishedAt).toBeTruthy()

    const notif = await prisma.adminNotification.findFirst({
      where: { type: 'schedule', link: '/contents/publish' },
      orderBy: { id: 'desc' },
    })
    expect(notif).toBeTruthy()
  })

  it('定时发布：待发布 → 定时发布中 → 取消定时；过去时间 400', async () => {
    const past = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/A1010/schedule')
      .set(auth())
      .send({ scheduledAt: '2020-01-01 00:00' })
    expect(past.status).toBe(400)
    expect(past.body).toEqual({ code: 400, message: '定时发布时间需晚于当前时间' })

    const schedule = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/A1010/schedule')
      .set(auth())
      .send({ scheduledAt: '2099-01-01 09:00' })
    expect(schedule.status).toBe(200)
    const scheduled = await listArticle('A1010')
    expect(scheduled?.status).toBe('scheduled')
    expect(scheduled?.scheduledAt).toBe('2099-01-01 09:00')

    const cancel = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/A1010/cancel-schedule')
      .set(auth())
    expect(cancel.status).toBe(200)
    const cancelled = await listArticle('A1010')
    expect(cancelled?.status).toBe('pending_release')
    expect(cancelled?.scheduledAt).toBeUndefined()
  })

  it('管理员下架：已发布 → 已关闭，详情保留下架与恢复历史', async () => {
    const withdraw = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/SU1001/withdraw')
      .set(auth())
      .send({ takedownReason: '测试下架原因' })
    expect(withdraw.status).toBe(200)
    const withdrawn = await listArticle('SU1001')
    expect(withdrawn?.status).toBe('closed')

    const detail = await request(app.getHttpServer())
      .get('/api/admin/contents/articles/SU1001')
      .set(auth())
    expect(detail.status).toBe(200)
    expect(detail.body.data.takedowns).toEqual([
      expect.objectContaining({ source: 'manual', reason: '测试下架原因', restoredAt: null }),
    ])

    const restore = await request(app.getHttpServer())
      .post('/api/admin/contents/articles/SU1001/restore')
      .set(auth())
    expect(restore.status).toBe(200)
    expect((await listArticle('SU1001'))?.status).toBe('published')
    const restoredDetail = await request(app.getHttpServer())
      .get('/api/admin/contents/articles/SU1001')
      .set(auth())
    expect(restoredDetail.body.data.takedowns[0]).toEqual(
      expect.objectContaining({ source: 'manual', reason: '测试下架原因', restoredAt: expect.any(String), restoredBy: expect.any(String) }),
    )
  })

  it('删除：待审核/已驳回/待发布可软删（列表不可见）；已发布删除 409', async () => {
    const remove = await request(app.getHttpServer())
      .delete('/api/admin/contents/articles/SU1008')
      .set(auth())
    expect(remove.status).toBe(200)
    expect(remove.body).toEqual({ code: 0, data: { code: 0 } })
    expect(await listArticle('SU1008')).toBeUndefined()

    /* 官方「待发布」资讯可直接删除（新增即待发布，随即删除） */
    const created = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set(auth())
      .send({
        title: '待删资讯',
        channel: 'official',
        columnIds: ['CL2003'],
        summary: '摘要',
        content: '<p>正文</p>',
        tags: [],
      })
    expect(created.status).toBe(200)
    const newId = created.body.data.id as string
    const delPendingRelease = await request(app.getHttpServer())
      .delete(`/api/admin/contents/articles/${newId}`)
      .set(auth())
    expect(delPendingRelease.status).toBe(200)
    expect(await listArticle(newId)).toBeUndefined()

    const conflict = await request(app.getHttpServer())
      .delete('/api/admin/contents/articles/A1002')
      .set(auth())
    expect(conflict.status).toBe(409)
    expect(conflict.body).toEqual({ code: 409, message: '仅待审核、已驳回、待发布或已关闭的文章可归档' })
  })

  it('编辑：待发布可编辑；已发布 409', async () => {
    const edit = await request(app.getHttpServer())
      .put('/api/admin/contents/articles/A1010')
      .set(auth())
      .send({ title: '改', channel: 'official', columnIds: ['CL2003'], summary: '改', content: '<p>改</p>', tags: [] })
    expect(edit.status).toBe(200)

    const conflict = await request(app.getHttpServer())
      .put('/api/admin/contents/articles/A1002')
      .set(auth())
      .send({ title: '改', channel: 'official', columnIds: ['CL2003'], summary: '改', content: '<p>改</p>', tags: [] })
    expect(conflict.status).toBe(409)
    expect(conflict.body).toEqual({ code: 409, message: '仅待发布、定时发布中或已驳回的文章可编辑' })
  })

  it('栏目：改名级联刷新 columnName 快照', async () => {
    const rename = await request(app.getHttpServer())
      .put('/api/admin/contents/columns/CL2003')
      .set(auth())
      .send({ name: '干货分享（改）', description: '改', sort: 3, submissionOpen: true })
    expect(rename.status).toBe(200)

    const list = await request(app.getHttpServer())
      .get('/api/admin/contents/articles')
      .set(auth())
      .query({ page: 1, pageSize: 50, columnId: 'CL2003' })
    expect(list.body.data.list.length).toBeGreaterThan(0)
    for (const a of list.body.data.list as Array<{ columnNames: string[] }>) {
      expect(a.columnNames).toEqual(['干货分享（改）'])
    }
  })

  it('栏目：开放投稿开关切换；系统保留栏目不可编辑/停用/删除', async () => {
    const toggle = await request(app.getHttpServer())
      .post('/api/admin/contents/columns/CL2004/toggle-submission')
      .set(auth())
    expect(toggle.status).toBe(200)
    const columns = await request(app.getHttpServer())
      .get('/api/admin/contents/columns')
      .set(auth())
    const cl2004 = (columns.body.data as Array<Record<string, unknown>>).find((c) => c.id === 'CL2004')
    expect(cl2004?.submissionOpen).toBe(true)

    const reserved = (columns.body.data as Array<Record<string, unknown>>).find((c) => c.id === 'COL_NONE')
    expect(reserved?.system).toBe(true)

    const editReserved = await request(app.getHttpServer())
      .put('/api/admin/contents/columns/COL_NONE')
      .set(auth())
      .send({ name: 'x', description: 'x', sort: 1, submissionOpen: true })
    expect(editReserved.status).toBe(409)
    expect(editReserved.body).toEqual({ code: 409, message: '系统保留栏目不可编辑' })

    const delReserved = await request(app.getHttpServer())
      .delete('/api/admin/contents/columns/COL_NONE')
      .set(auth())
    expect(delReserved.status).toBe(409)
    expect(delReserved.body).toEqual({ code: 409, message: '系统保留栏目不可删除' })
  })

  it('栏目：删除后其文章转移至「未指定」保留栏目', async () => {
    const createColumn = await request(app.getHttpServer())
      .post('/api/admin/contents/columns')
      .set(auth())
      .send({ name: '临时栏目', description: '待删除', sort: 50, submissionOpen: true })
    expect(createColumn.status).toBe(200)
    const columnId = createColumn.body.data.id as string

    const createArticle = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set(auth())
      .send({ title: '临时文章', channel: 'official', columnIds: [columnId], summary: 'x', content: '<p>x</p>', tags: [] })
    expect(createArticle.status).toBe(200)
    const articleId = createArticle.body.data.id as string
    expect(createArticle.body.data.columnId).toBe(columnId)

    const del = await request(app.getHttpServer())
      .delete(`/api/admin/contents/columns/${columnId}`)
      .set(auth())
    expect(del.status).toBe(200)

    const moved = await listArticle(articleId)
    expect(moved?.columnIds).toEqual(['COL_NONE'])
    expect(moved?.columnNames).toEqual(['未指定'])
  })

})
