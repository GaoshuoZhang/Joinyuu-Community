/* M1-D 办公位/区域/租约 e2e（wiki-backend.md §13 M1-D）：
 * 覆盖：新增租约锁定办公位（assigned）→ 终止释放（idle）+ 非法流转 409 + 租约临期通知（同日去重）。
 * 前置：docker compose up + prisma migrate + seed（WS1001~WS1008 已分配 / WS1009~WS1012 空闲 /
 *       LS2001 生效中 / E2001 星澜智能科技存在 / SystemConfig.leaseExpireRemindDays=15）。
 * 定时任务直接调用 SchedulerService 公开方法（免等 cron）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { SchedulerService } from '../src/scheduler/scheduler.service'
import { formatToday } from '../src/common/utils/time'

describe('M1-D workstations 办公位/区域/租约', () => {
  let app: INestApplication
  let token: string
  let leaseId: string

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

  it('新增租约 → 锁定空闲办公位为 assigned', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/workstation-leases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: 'E2001',
        enterpriseName: '星澜智能科技',
        renterType: 'enterprise',
        workstationIds: ['WS1009', 'WS1010'],
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        longTerm: false,
        monthlyRent: 1200,
        rentPeriod: 'month',
        contactName: '陈屿',
        contactPhone: '13801210001',
      })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    leaseId = res.body.data.id
    expect(leaseId).toMatch(/^LS\d+$/)

    const ws = await request(app.getHttpServer())
      .get('/api/admin/workstations')
      .set('Authorization', `Bearer ${token}`)
    const target = (ws.body.data as Array<Record<string, unknown>>).find((w) => w.id === 'WS1009')
    expect(target).toBeDefined()
    expect(target!.status).toBe('assigned')
    expect(target!.enterpriseId).toBe('E2001')
    expect(target!.enterpriseName).toBe('星澜智能科技')
    expect(target!.leaseId).toBe(leaseId)
    expect(target!.area).toBe('A 区 · 开放办公位')
  })

  it('终止租约 → 释放办公位为 idle', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/admin/workstation-leases/${leaseId}/terminate`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ code: 0 })

    const ws = await request(app.getHttpServer())
      .get('/api/admin/workstations')
      .set('Authorization', `Bearer ${token}`)
    const target = (ws.body.data as Array<Record<string, unknown>>).find((w) => w.id === 'WS1009')
    expect(target!.status).toBe('idle')
    expect(target!.enterpriseId).toBeUndefined()
    expect(target!.enterpriseName).toBeUndefined()
    expect(target!.leaseId).toBeUndefined()
  })

  it('非法操作 → 409', async () => {
    // 删除已分配办公位
    const del = await request(app.getHttpServer())
      .delete('/api/admin/workstations/WS1001')
      .set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(409)

    // 已分配办公位直接标记维修
    const status = await request(app.getHttpServer())
      .post('/api/admin/workstations/WS1001/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'maintenance' })
    expect(status.status).toBe(409)

    // 删除非空区域
    const area = await request(app.getHttpServer())
      .delete('/api/admin/workstation-areas/WA1001')
      .set('Authorization', `Bearer ${token}`)
    expect(area.status).toBe(409)

    // 用已分配办公位新增租约
    const lease = await request(app.getHttpServer())
      .post('/api/admin/workstation-leases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: 'E2001',
        enterpriseName: '星澜智能科技',
        renterType: 'enterprise',
        workstationIds: ['WS1001'],
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        longTerm: false,
        monthlyRent: 1000,
        rentPeriod: 'month',
        contactName: '陈屿',
        contactPhone: '13801210001',
      })
    expect(lease.status).toBe(409)
    expect(lease.body.message).toBe('所选办公位中存在已分配或维护中的办公位')
  })

  it('租约临期通知 + 同日去重', async () => {
    const prisma = app.get(PrismaService)
    const scheduler = app.get(SchedulerService)

    await prisma.lease.update({
      where: { id: 'LS2001' },
      data: { status: 'active', longTerm: false, endDate: formatToday() },
    })

    await scheduler.scanLeaseExpiring()
    const first = await prisma.adminNotification.count({
      where: { type: 'lease', content: { contains: 'LS2001' } },
    })
    expect(first).toBe(1)

    await scheduler.scanLeaseExpiring()
    const second = await prisma.adminNotification.count({
      where: { type: 'lease', content: { contains: 'LS2001' } },
    })
    expect(second).toBe(1)
  })

  it('已停用企业新增租约 → 400「企业已停用不可新增租约」', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/enterprises/E2009/disable')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const res = await request(app.getHttpServer())
      .post('/api/admin/workstation-leases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: 'E2009',
        enterpriseName: '青柠健康',
        renterType: 'enterprise',
        workstationIds: ['WS1012'],
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        longTerm: false,
        monthlyRent: 800,
        rentPeriod: 'month',
        contactName: '联系人',
        contactPhone: '13800000000',
      })
    expect(res.status).toBe(400)
  })

  it('种子终止租约 LS2008 为自定义租赁方（不关联任何企业，避免与新增企业 ID 冲突）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/workstation-leases')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const lease = (res.body.data as Array<Record<string, unknown>>).find((l) => l.id === 'LS2008')
    expect(lease).toBeDefined()
    expect(lease!.enterpriseId).toBe('')
    expect(lease!.renterType).toBe('custom')
  })
})
