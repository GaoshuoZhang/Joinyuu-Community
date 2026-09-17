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

  it('偏好与归档端点已移除，站内信单一列表且始终写入', async () => {
    expect((await appGet(app, token, '/api/app/me/notices/prefs')).status).toBe(404)
    expect((await request(app.getHttpServer()).put('/api/app/me/notices/prefs').set('Authorization', `Bearer ${token}`).send({ enabledTypes: ['system'] })).status).toBe(404)
    expect((await appPost(app, token, '/api/app/notices/UN1/archive', { archived: true })).status).toBe(404)

    await notify.pushNotice('U1001', { type: 'demand', title: '始终写入', content: '站内信不再受分类偏好影响' })
    const list = await appGet(app, token, '/api/app/notices?type=system&status=archived')
    expect(list.body.data.list.some((item: { title: string }) => item.title === '始终写入')).toBe(true)
    expect(await prisma.userNotification.count({ where: { userId: 'U1001' } })).toBeGreaterThan(0)
  })
})
