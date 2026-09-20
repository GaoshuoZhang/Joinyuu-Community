/* M1-D 公告栏 e2e（wiki-backend.md §13 M1-D / §7.14）：
 * 覆盖：首页公告单例（保存/开启/关闭 → 客户端下发）；新增即发布 → 下架 → 重新发布 → 开启置顶全链路；置顶全局唯一；非法流转 409；删除。
 * 前置：docker compose up + prisma migrate + seed（AN1001 置顶已发布 / AN1002 已发布未置顶 / AN1005 已下架 / AN1006 已下架）。 */
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

  it('置顶全局唯一：开启一条自动取消其他；首页公告条仅一条，全关则不下发', async () => {
    /* 前一用例已开启一条置顶；此处开启 AN1002 应自动取消其余 */
    const pin = await request(app.getHttpServer())
      .post('/api/admin/announcements/AN1002/toggle-pin')
      .set('Authorization', `Bearer ${token}`)
    expect(pin.status).toBe(200)

    const list = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50 })
    const pinned = (list.body.data.list as Array<{ id: string; pinned: boolean }>).filter((x) => x.pinned)
    expect(pinned.map((x) => x.id)).toEqual(['AN1002'])

    /* 客户端首页只消费开启的那一条 */
    const home = await request(app.getHttpServer()).get('/api/app/home')
    expect(home.status).toBe(200)
    expect(home.body.data.announcements.length).toBe(1)
    expect(home.body.data.announcements[0].id).toBe('AN1002')

    /* 关闭唯一置顶 → 首页不再下发公告（客户端顶部公告条隐藏） */
    await request(app.getHttpServer())
      .post('/api/admin/announcements/AN1002/toggle-pin')
      .set('Authorization', `Bearer ${token}`)
    const homeOff = await request(app.getHttpServer()).get('/api/app/home')
    expect(homeOff.body.data.announcements).toEqual([])
  })

  it('列表置顶优先，其余按发布时间倒序', async () => {
    /* 上一用例收尾时关闭了唯一置顶；这里先重新开启 AN1001 再断言排序 */
    const pin = await request(app.getHttpServer())
      .post('/api/admin/announcements/AN1001/toggle-pin')
      .set('Authorization', `Bearer ${token}`)
    expect(pin.status).toBe(200)

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

  it('首页公告单例：保存并开启 → 客户端仅下发一条；关闭 → 不下发', async () => {
    const save = await request(app.getHttpServer())
      .put('/api/admin/announcements/home')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '首页公告标题', content: '首页公告内容', enabled: true })
    expect(save.status).toBe(200)
    expect(save.body).toEqual({ code: 0, data: { code: 0 } })

    const detail = await request(app.getHttpServer())
      .get('/api/admin/announcements/home')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.enabled).toBe(true)
    expect(detail.body.data.title).toBe('首页公告标题')

    const home = await request(app.getHttpServer()).get('/api/app/home')
    expect(home.body.data.announcements.length).toBe(1)
    expect(home.body.data.announcements[0].title).toBe('首页公告标题')

    await request(app.getHttpServer())
      .put('/api/admin/announcements/home')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '首页公告标题', content: '首页公告内容', enabled: false })
    const homeOff = await request(app.getHttpServer()).get('/api/app/home')
    expect(homeOff.body.data.announcements).toEqual([])
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
