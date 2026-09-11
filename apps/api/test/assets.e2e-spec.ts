/* M1.5 R4 素材库 e2e：
 * 覆盖：multipart 上传（返回 URL）/ 列表 / 公开读取（nosniff 响应头）/ 删除（对象与文件同步删除）/
 *       类型与时序校验（SVG 禁用、魔数嗅探防 MIME 伪造）。
 * 前置：seed；上传落本地 uploads/（对象存储驱动可替换）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

/* 1x1 PNG */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

describe('M1.5 R4 素材库', () => {
  let app: INestApplication
  let token: string
  let assetId: string
  let storeKey: string
  let originalUrl: string

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

  it('上传图片 → 返回素材（含 URL）；列表可见', async () => {
    const upload = await request(app.getHttpServer())
      .post('/api/admin/assets')
      .set(auth())
      .field('bizType', 'goods')
      .attach('file', PNG, { filename: '演示素材.png', contentType: 'image/png' })
    expect(upload.status).toBe(200)
    expect(upload.body.data.id).toMatch(/^AST\d+$/)
    expect(upload.body.data.mime).toBe('image/png')
    expect(upload.body.data.url).toContain('/api/public/files/')
    /* 中文文件名不乱码（multipart latin1 → UTF-8 还原） */
    expect(upload.body.data.fileName).toBe('演示素材.png')
    assetId = upload.body.data.id
    storeKey = upload.body.data.url.split('/').pop()
    originalUrl = upload.body.data.url

    const list = await request(app.getHttpServer())
      .get('/api/admin/assets')
      .set(auth())
      .query({ bizType: 'goods' })
    expect(list.status).toBe(200)
    expect((list.body.data as Array<{ id: string }>).some((a) => a.id === assetId)).toBe(true)
  })

  it('公开读取素材：无需鉴权，返回图片内容与防嗅探响应头', async () => {
    const file = await request(app.getHttpServer()).get(`/api/public/files/${storeKey}`)
    expect(file.status).toBe(200)
    expect(file.headers['content-type']).toContain('image/png')
    expect(file.headers['x-content-type-options']).toBe('nosniff')
    expect(file.headers['content-disposition']).toContain('inline')
  })

  it('不支持的 MIME → 400；未选择文件 → 400', async () => {
    const bad = await request(app.getHttpServer())
      .post('/api/admin/assets')
      .set(auth())
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' })
    expect(bad.status).toBe(400)
    expect(bad.body).toEqual({ code: 400, message: '不支持的文件类型' })

    const empty = await request(app.getHttpServer())
      .post('/api/admin/assets')
      .set(auth())
    expect(empty.status).toBe(400)
    expect(empty.body).toEqual({ code: 400, message: '请选择要上传的文件' })
  })

  it('SVG 与伪造 MIME 均被拒（魔数嗅探，不信任客户端声明）', async () => {
    const svg = await request(app.getHttpServer())
      .post('/api/admin/assets')
      .set(auth())
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), {
        filename: 'x.svg',
        contentType: 'image/svg+xml',
      })
    expect(svg.status).toBe(400)
    expect(svg.body).toEqual({ code: 400, message: '不支持的文件类型' })

    const spoof = await request(app.getHttpServer())
      .post('/api/admin/assets')
      .set(auth())
      .attach('file', Buffer.from('hello'), { filename: 'fake.png', contentType: 'image/png' })
    expect(spoof.status).toBe(400)
    expect(spoof.body).toEqual({ code: 400, message: '不支持的文件类型' })
  })

  it('替换素材：同 URL 覆盖内容即时生效；类型不一致 400', async () => {
    const replaced = await request(app.getHttpServer())
      .post(`/api/admin/assets/${assetId}/replace`)
      .set(auth())
      .attach('file', Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(100, 1)]), {
        filename: '替换图.png',
        contentType: 'image/png',
      })
    expect(replaced.status).toBe(200)
    expect(replaced.body.data.url).toBe(originalUrl)
    expect(replaced.body.data.size).toBe(108)

    const file = await request(app.getHttpServer()).get(`/api/public/files/${storeKey}`)
    expect(file.status).toBe(200)
    expect((file.body as Buffer).length).toBe(108)

    const wrongType = await request(app.getHttpServer())
      .post(`/api/admin/assets/${assetId}/replace`)
      .set(auth())
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0x00]), { filename: 'x.jpg', contentType: 'image/jpeg' })
    expect(wrongType.status).toBe(400)
    expect(wrongType.body).toEqual({ code: 400, message: '替换文件类型须与原文件一致' })
  })

  it('上传大小限制：按系统配置校验并返回中文提示', async () => {
    const current = (await request(app.getHttpServer()).get('/api/admin/system/config').set(auth())).body.data
    const setLimit = await request(app.getHttpServer())
      .put('/api/admin/system/config')
      .set(auth())
      .send({ ...current, uploadMaxSizeMb: 1 })
    expect(setLimit.status).toBe(200)

    const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 10, 1)])
    const up = await request(app.getHttpServer())
      .post('/api/admin/assets')
      .set(auth())
      .attach('file', big, { filename: 'big.png', contentType: 'image/png' })
    expect(up.status).toBe(400)
    expect(up.body).toEqual({ code: 400, message: '文件大小不能超过 1 MB' })

    const restore = await request(app.getHttpServer())
      .put('/api/admin/system/config')
      .set(auth())
      .send({ ...current, uploadMaxSizeMb: 10 })
    expect(restore.status).toBe(200)
  })

  it('文章保存时绑定素材来源（资讯发布-<文章 ID>）', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/admin/contents/articles')
      .set(auth())
      .send({
        title: '素材绑定测试',
        channel: 'official',
        columnIds: ['CL2003'],
        summary: '摘要',
        content: `<p><img src="${originalUrl}"></p>`,
        tags: [],
      })
    expect(create.status).toBe(200)
    const articleId = (create.body.data as { id: string }).id

    const list = await request(app.getHttpServer()).get('/api/admin/assets').set(auth())
    const bound = (list.body.data as Array<{ url: string; sourceType?: string; sourceId?: string }>).find(
      (a) => a.url === originalUrl,
    )
    expect(bound?.sourceType).toBe('article')
    expect(bound?.sourceId).toBe(articleId)
  })

  it('删除素材 → 落库与对象同步删除（公开读取 404）', async () => {
    const del = await request(app.getHttpServer())
      .delete(`/api/admin/assets/${assetId}`)
      .set(auth())
    expect(del.status).toBe(200)
    expect(del.body).toEqual({ code: 0, data: { code: 0 } })

    const file = await request(app.getHttpServer()).get(`/api/public/files/${storeKey}`)
    expect(file.status).toBe(404)

    const missing = await request(app.getHttpServer())
      .delete(`/api/admin/assets/${assetId}`)
      .set(auth())
    expect(missing.status).toBe(404)
  })
})
