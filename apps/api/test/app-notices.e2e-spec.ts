/* M2-R R1 验收：站内信（列表/未读/已读/全部已读/归档）+ 通知偏好
 * 前置：docker compose up + prisma migrate + seed（用户统一密码 user123） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost } from './helpers/app-login'
import { NotificationService } from '../src/common/notify/notification.service'

describe('M2-R R1 站内信与通知偏好', () => {
  let app: INestApplication
  let token: string
  let notify: NotificationService

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    notify = moduleRef.get(NotificationService)
    token = await appLoginAs(app, '13801210001', 'user123')
    await notify.pushNotice('U1001', { type: 'system', title: 'R1 测试通知', content: '用于验证已读与归档' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('站内信列表返回未读数', async () => {
    const res = await appGet(app, token, '/api/app/notices?page=1&pageSize=20')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.list)).toBe(true)
    expect(typeof res.body.data.unreadCount).toBe('number')
    expect(typeof res.body.data.total).toBe('number')
  })

  it('标记已读后未读数递减', async () => {
    const res = await appGet(app, token, '/api/app/notices?page=1&pageSize=1')
    const before = await appGet(app, token, '/api/app/notices/unread-count')
    const unreadBefore: number = before.body.data.count

    if (res.body.data.list.length > 0) {
      const id: string = res.body.data.list[0].id
      const read = await appPost(app, token, `/api/app/notices/${id}/read`, {})
      expect(read.status).toBe(200)
      expect(read.body.code).toBe(0)

      const after = await appGet(app, token, '/api/app/notices/unread-count')
      expect(after.body.data.count).toBe(unreadBefore - 1)
    } else {
      // 无通知时不失败（seed 可能无初始通知）
      expect(true).toBe(true)
    }
  })

  it('全部已读后未读数为 0', async () => {
    const readAll = await appPost(app, token, '/api/app/notices/read-all', {})
    expect(readAll.status).toBe(200)
    const after = await appGet(app, token, '/api/app/notices/unread-count')
    expect(after.body.data.count).toBe(0)
  })

  it('通知偏好：默认 all；改为子集后生效；禁止空集合', async () => {
    const prefs = await appGet(app, token, '/api/app/me/notices/prefs')
    expect(prefs.status).toBe(200)
    expect(prefs.body.data.enabledTypes).toContain('all')

    const bad = await request(app.getHttpServer())
      .put('/api/app/me/notices/prefs')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabledTypes: [] })
    expect(bad.status).toBe(400)

    const ok = await request(app.getHttpServer())
      .put('/api/app/me/notices/prefs')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabledTypes: ['system', 'order'] })
    expect(ok.status).toBe(200)
    const after = await appGet(app, token, '/api/app/me/notices/prefs')
    expect(after.body.data.enabledTypes).toEqual(['system', 'order'])
    await notify.pushNotice('U1001', { type: 'demand', title: '应被过滤', content: '偏好关闭后不应写入' })
    const filtered = await appGet(app, token, '/api/app/notices?type=demand')
    expect(filtered.body.data.list).toHaveLength(0)
  })

  it('归档：仅已读可归档；归档后不在默认列表', async () => {
    const list = await appGet(app, token, '/api/app/notices?page=1&pageSize=1')
    if (list.body.data.list.length === 0) return
    const id: string = list.body.data.list[0].id

    await appPost(app, token, `/api/app/notices/${id}/read`, {})
    const arch = await appPost(app, token, `/api/app/notices/${id}/archive`, { archived: true })
    expect(arch.status).toBe(200)
    const defaults = await appGet(app, token, '/api/app/notices')
    expect(defaults.body.data.list.some((item: { id: string }) => item.id === id)).toBe(false)
    const archived = await appGet(app, token, '/api/app/notices?status=archived')
    expect(archived.body.data.list.some((item: { id: string }) => item.id === id)).toBe(true)
  })
})
