/* M1-D 公告栏 e2e（wiki-backend.md §13 M1-D / §7.14）：
 * 覆盖：多条公告列表（新增即发布 → 下架 → 重新发布 → 启用）；启用互锁（全局至多一条，全关为空）；
 * 下架公告不可启用（409）；兼容单例接口指定 id 定向更新；非法流转 409；删除。
 * 前置：docker compose up + prisma migrate + seed（AN1001 启用已发布 / AN1002 已发布未启用 / AN1005 已下架 / AN1006 已下架）。 */
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

  it('新增即发布 → 下架 → 重新发布 → 启用', async () => {
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

  it('启用互锁：至多一条启用（开启一条自动关闭其它）；首页仅下发启用的；全关则不下发', async () => {
    /* 列表为多条目：seed 中 AN1001~AN1004 均为已发布（AN1005/AN1006 已下架） */
    const seeded = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50 })
    expect(seeded.body.data.list.length).toBeGreaterThan(1)

    /* 前一用例已启用一条；此处启用 AN1002 应自动取消其余 */
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

    /* 客户端首页只消费启用的那一条（数组结构保留多条能力，互锁保证长度 ≤ 1） */
    const home = await request(app.getHttpServer()).get('/api/app/home')
    expect(home.status).toBe(200)
    expect(Array.isArray(home.body.data.announcements)).toBe(true)
    expect(home.body.data.announcements.length).toBeLessThanOrEqual(1)
    expect(home.body.data.announcements[0].id).toBe('AN1002')

    /* 关闭唯一启用 → 首页不再下发公告（客户端顶部公告条隐藏） */
    await request(app.getHttpServer())
      .post('/api/admin/announcements/AN1002/toggle-pin')
      .set('Authorization', `Bearer ${token}`)
    const homeOff = await request(app.getHttpServer()).get('/api/app/home')
    expect(homeOff.body.data.announcements).toEqual([])
  })

  it('列表启用优先，其余按发布时间倒序', async () => {
    /* 上一用例收尾时关闭了唯一启用；这里先重新启用 AN1001 再断言排序 */
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

  it('非法流转 → 409（下架已下架 / 发布已发布 / 启用已下架）', async () => {
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

    /* 启用要求已发布：下架公告需先重新发布（前端相应禁用开关） */
    const pin = await request(app.getHttpServer())
      .post('/api/admin/announcements/AN1005/toggle-pin')
      .set('Authorization', `Bearer ${token}`)
    expect(pin.status).toBe(409)
    expect(pin.body).toEqual({ code: 409, message: '仅已发布的公告可启用' })
  })

  it('兼容单例接口：不传 id 覆盖最近一条并启用 → 客户端下发；传 id 仅定向更新该条', async () => {
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
    const overwrittenId = detail.body.data.id as string

    const home = await request(app.getHttpServer()).get('/api/app/home')
    expect(home.body.data.announcements.length).toBeLessThanOrEqual(1)
    expect(home.body.data.announcements[0].title).toBe('首页公告标题')

    await request(app.getHttpServer())
      .put('/api/admin/announcements/home')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '首页公告标题', content: '首页公告内容', enabled: false })
    const homeOff = await request(app.getHttpServer()).get('/api/app/home')
    expect(homeOff.body.data.announcements).toEqual([])

    /* 传 id：只更新指定那一条（上一步被覆盖的那条标题保持不变），并执行启用互锁 */
    const aimed = await request(app.getHttpServer())
      .put('/api/admin/announcements/home')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'AN1004', title: '定向更新标题', content: '定向更新内容', enabled: true })
    expect(aimed.status).toBe(200)

    const aimedDetail = await request(app.getHttpServer())
      .get('/api/admin/announcements/home')
      .set('Authorization', `Bearer ${token}`)
    expect(aimedDetail.body.data.id).toBe('AN1004')
    expect(aimedDetail.body.data.title).toBe('定向更新标题')

    const kept = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50, keyword: overwrittenId })
    expect(kept.body.data.list.find((x: { id: string }) => x.id === overwrittenId).title).toBe('首页公告标题')
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
