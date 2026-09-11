/* M1-D 公告栏 e2e（wiki-backend.md §13 M1-D / §7.14）：
 * 覆盖：新增即发布 → 下架 → 重新发布 → 置顶全链路；置顶优先排序；非法流转 409；删除。
 * 前置：docker compose up + prisma migrate + seed（AN1001/AN1002 置顶已发布 / AN1005 已下架 / AN1006 已下架）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1-D announcements 公告栏', () => {
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

  it('新增即发布 → 下架 → 重新发布 → 置顶', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '测试公告', content: '公告内容', pinned: false })
    expect(create.status).toBe(200)
    expect(create.body.data.status).toBe('published')
    expect(create.body.data.pinned).toBe(false)
    const id = create.body.data.id as string
    expect(id).toMatch(/^AN\d+$/)

    const withdraw = await request(app.getHttpServer())
      .post(`/api/admin/announcements/${id}/withdraw`)
      .set('Authorization', `Bearer ${token}`)
    expect(withdraw.status).toBe(200)
    expect(withdraw.body).toEqual({ code: 0, data: { code: 0 } })

    const afterWithdraw = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50, keyword: id })
    expect(afterWithdraw.body.data.list.find((x: { id: string }) => x.id === id).status).toBe('withdrawn')

    const publish = await request(app.getHttpServer())
      .post(`/api/admin/announcements/${id}/publish`)
      .set('Authorization', `Bearer ${token}`)
    expect(publish.status).toBe(200)
    expect(publish.body).toEqual({ code: 0, data: { code: 0 } })

    const pin = await request(app.getHttpServer())
      .post(`/api/admin/announcements/${id}/toggle-pin`)
      .set('Authorization', `Bearer ${token}`)
    expect(pin.status).toBe(200)
    expect(pin.body).toEqual({ code: 0, data: { code: 0 } })

    const afterPin = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50, keyword: id })
    const item = afterPin.body.data.list.find((x: { id: string }) => x.id === id)
    expect(item.status).toBe('published')
    expect(item.pinned).toBe(true)
  })

  it('列表置顶优先，其余按发布时间倒序', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50 })
    expect(res.status).toBe(200)
    const list = res.body.data.list as Array<{ pinned: boolean }>
    expect(list.length).toBeGreaterThan(0)
    expect(list[0].pinned).toBe(true)

    let sawUnpinned = false
    for (const item of list) {
      if (item.pinned) {
        expect(sawUnpinned).toBe(false)
      } else {
        sawUnpinned = true
      }
    }
  })

  it('非法流转 → 409（下架已下架 / 发布已发布）', async () => {
    const withdraw = await request(app.getHttpServer())
      .post('/api/admin/announcements/AN1005/withdraw')
      .set('Authorization', `Bearer ${token}`)
    expect(withdraw.status).toBe(409)
    expect(withdraw.body).toEqual({ code: 409, message: '仅已发布公告可下架' })

    const publish = await request(app.getHttpServer())
      .post('/api/admin/announcements/AN1001/publish')
      .set('Authorization', `Bearer ${token}`)
    expect(publish.status).toBe(409)
    expect(publish.body).toEqual({ code: 409, message: '仅已下架公告可重新发布' })
  })

  it('删除公告 → 列表不再返回', async () => {
    const del = await request(app.getHttpServer())
      .delete('/api/admin/announcements/AN1006')
      .set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
    expect(del.body).toEqual({ code: 0, data: { code: 0 } })

    const list = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50, keyword: 'AN1006' })
    expect(list.body.data.list.find((x: { id: string }) => x.id === 'AN1006')).toBeUndefined()
  })
})
