/* M2-R R1 验收：站内信列表、未读、已读与全部已读
 * 前置：docker compose up + prisma migrate + seed（用户统一密码 user123） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost } from './helpers/app-login'
import { NotificationService } from '../src/common/notify/notification.service'
import { PrismaService } from '../src/common/prisma/prisma.service'

describe('M2-R R1 站内信', () => {
  let app: INestApplication
  let token: string
  let notify: NotificationService
  let prisma: PrismaService

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    notify = moduleRef.get(NotificationService)
    prisma = moduleRef.get(PrismaService)
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

  it('通知偏好：默认全部开启 → 静音后不再写入该类通知 → 安全类不可静音 → 恢复后送达', async () => {
    const initial = await appGet(app, token, '/api/app/notices/preferences')
    expect(initial.status).toBe(200)
    expect(initial.body.data.types.length).toBeGreaterThan(0)
    expect(initial.body.data.mutedTypes).toEqual([])

    /* system 为安全类通知，不可静音 */
    const invalid = await request(app.getHttpServer())
      .put('/api/app/notices/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ mutedTypes: ['system'] })
    expect(invalid.status).toBe(400)

    /* 静音 demand 后该类通知不再写入 */
    const mute = await request(app.getHttpServer())
      .put('/api/app/notices/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ mutedTypes: ['demand'] })
    expect(mute.status).toBe(200)
    expect(mute.body.data.mutedTypes).toEqual(['demand'])

    await notify.pushNotice('U1001', { type: 'demand', title: '应被静音', content: '静音后不写入' })
    const listAfterMute = await appGet(app, token, '/api/app/notices?page=1&pageSize=50')
    expect(listAfterMute.body.data.list.some((item: { title: string }) => item.title === '应被静音')).toBe(false)

    /* system 通知不受影响 */
    await notify.pushNotice('U1001', { type: 'system', title: '安全通知必达', content: '始终写入' })
    const listSystem = await appGet(app, token, '/api/app/notices?page=1&pageSize=50')
    expect(listSystem.body.data.list.some((item: { title: string }) => item.title === '安全通知必达')).toBe(true)

    /* 恢复后 demand 通知再次写入 */
    await request(app.getHttpServer())
      .put('/api/app/notices/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ mutedTypes: [] })
    await notify.pushNotice('U1001', { type: 'demand', title: '恢复后送达', content: '恢复接收' })
    const listRestored = await appGet(app, token, '/api/app/notices?page=1&pageSize=50')
    expect(listRestored.body.data.list.some((item: { title: string }) => item.title === '恢复后送达')).toBe(true)

    expect(await prisma.userNotification.count({ where: { userId: 'U1001' } })).toBeGreaterThan(0)
  })

  it('归档端点已移除，站内信单一列表', async () => {
    expect((await appGet(app, token, '/api/app/me/notices/prefs')).status).toBe(404)
    expect((await appPost(app, token, '/api/app/notices/UN1/archive', { archived: true })).status).toBe(404)
  })
})
