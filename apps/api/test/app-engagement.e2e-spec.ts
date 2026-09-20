import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { addDays, formatToday } from '../src/common/utils/time'
import { reseed } from './helpers/reseed'
import { appLoginAs } from './helpers/app-login'
import { loginAs } from './helpers/login'

describe('M2-R 自动积分、发布额度、等级与埋点', () => {
  let app: INestApplication
  let db: PrismaService
  let admin: string
  let user: string
  let other: string
  const uid = 'U1001'
  beforeAll(async () => {
    reseed()
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = module.createNestApplication(); await app.init()
    db = app.get(PrismaService)
    admin = await loginAs(app)
    user = await appLoginAs(app, '13801210001', 'user123')
    other = await appLoginAs(app, '13801210005', 'user123')
  })
  afterAll(async () => { await app?.close() })
  const get = (path: string, token = user) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)
  const post = (path: string, body: object = {}, token = user) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send(body)
  const put = (path: string, body: object) => request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${admin}`).send(body)

  it('任务中心和服务申请端点已移除，固定自动积分目录保留实际业务触发项', async () => {
    expect((await get('/api/app/me/tasks')).status).toBe(404)
    expect((await post('/api/app/me/tasks/activity_checkin/claim')).status).toBe(404)
    expect((await get('/api/admin/engagement/tasks', admin)).status).toBe(404)
    expect((await post('/api/app/service-applications')).status).toBe(404)
    expect((await get('/api/app/me/service-applications')).status).toBe(404)
    expect((await post('/api/app/me/service-applications/SA1/urge')).status).toBe(404)
    expect((await get('/api/admin/engagement/services', admin)).status).toBe(404)
    expect((await post('/api/admin/engagement/services/SA1/review', {}, admin)).status).toBe(404)
    const codes = (await db.pointsRule.findMany({ orderBy: { code: 'asc' } })).map(rule => rule.code)
    expect(codes).toEqual(expect.arrayContaining(['activity_checkin', 'article_accepted', 'demand_published', 'project_milestone']))
  })

  it('个体与企业等级表独立保存，企业身份经验和等级跟随企业同步', async () => {
    const individual = await get('/api/admin/rules/levels?identityType=community_individual', admin)
    const enterprise = await get('/api/admin/rules/levels?identityType=community_enterprise', admin)
    expect(individual.status).toBe(200)
    expect(enterprise.status).toBe(200)
    expect(individual.body.data[0].identityType).toBe('community_individual')
    expect(enterprise.body.data[0].identityType).toBe('community_enterprise')
    expect((await put('/api/admin/rules/levels', { identityType: 'community_enterprise', tiers: [
      { label: '企业一级', threshold: 0 }, { label: '企业二级', threshold: 10 },
    ] })).status).toBe(200)
    await db.enterprise.update({ where: { id: 'E2001' }, data: { experience: 20 } })
    expect((await put('/api/admin/rules/levels', { identityType: 'community_enterprise', tiers: [
      { label: '企业一级', threshold: 0 }, { label: '企业二级', threshold: 10 },
    ] })).status).toBe(200)
    const identities = await db.userIdentity.findMany({ where: { type: 'community_enterprise', enterpriseId: 'E2001' } })
    expect(identities.every(identity => identity.experience === 20 && identity.level === 2)).toBe(true)
  })

  it('个人和企业聚合来自业务记录，非企业成员不可越权', async () => {
    const stats = await get('/api/app/me/stats')
    expect(stats.status).toBe(200)
    const earned = await db.pointsRecord.aggregate({ where: { userId: uid, delta: { gt: 0 } }, _sum: { delta: true } })
    expect(stats.body.data.pointsEarned).toBe(earned._sum.delta)
    expect(stats.body.data.responses).toBe(await db.demandRespondent.count({ where: { userId: uid } }))
    expect((await get('/api/app/me/enterprise-workbench?enterpriseId=E2001', other)).status).toBe(403)
    const bench = await get('/api/app/me/enterprise-workbench?enterpriseId=E2001')
    expect(bench.status).toBe(200)
    expect(bench.body.data.memberCount).toBeGreaterThan(0)
  })

  it('未实名发布额度并发不能突破，失败不消耗；报名和预约也执行统一额度', async () => {
    await db.user.update({ where: { uid }, data: { realName: null, citizenId: null } })
    const limits = (await request(app.getHttpServer()).get('/api/admin/rules/publishing-limits').set('Authorization', `Bearer ${admin}`)).body.data
    const individualIdentity = await db.userIdentity.findFirstOrThrow({ where: { userId: 'U1002', type: 'community_individual' } })
    const individualToken = await appLoginAs(app, '13801210002', 'user123')
    for (const row of limits) {
      if (row.scope === 'personal_unverified') Object.assign(row, { demandPublishLimit: 1, articleSubmitLimit: 0 })
      if (row.scope === 'community_individual' && row.level === individualIdentity.level) Object.assign(row, { eventEnrollLimit: 0, spaceReserveLimit: 0 })
    }
    expect((await put('/api/admin/rules/publishing-limits', { rules: limits })).status).toBe(200)
    const data = { title: '每日额度测试', description: '测试发布额度', kind: 'task', categoryCode: 'DC001', categoryDict: 'demand_category', asIdentity: 'individual', contactName: '测试', contactPhone: '13801210001', deliverable: '报告', deliverBy: '2026-12-01' }
    const results = await Promise.all([post('/api/app/demands', data), post('/api/app/demands', data)])
    expect(results.map(r => r.status).sort()).toEqual([200, 403])
    expect(await db.publishingLimitUsage.findUnique({ where: { subjectType_subjectId_action_date: { subjectType: 'user', subjectId: uid, action: 'demand_publish', date: formatToday() } } })).toMatchObject({ count: 1 })
    const event = await db.communityEvent.findFirstOrThrow({ where: { status: 'published', enrollments: { none: { userId: 'U1002' } } } })
    await db.communityEvent.update({ where: { id: event.id }, data: { startTime: '2026-12-01 09:00', endTime: '2026-12-01 12:00', enrollmentDeadline: '2026-11-30 18:00', enrollmentOpen: true, visibilityIdentities: [], visibilityLevels: [], enrollmentIdentities: [], enrollmentLevels: [] } })
    expect((await post(`/api/app/events/${event.id}/enroll`, {}, individualToken)).status).toBe(403)
    const space = await db.space.findFirstOrThrow({ where: { needReservation: true } })
    await db.space.update({ where: { id: space.id }, data: { status: 'available', advanceDays: 30, openHours: [{ start: '08:00', end: '22:00' }] } })
    expect((await post('/api/app/spaces/reservations', { spaceId: space.id, date: addDays(formatToday(), 3), start: '09:00', end: '10:00', topic: '额度测试', attendees: 1, asIdentity: 'community_individual' }, individualToken)).status).toBe(403)
    expect(await db.publishingLimitUsage.count({ where: { subjectId: 'U1002', action: 'space_reserve' } })).toBe(0)
    const demandId = results.find(r => r.status === 200)!.body.data.id
    expect((await post(`/api/app/me/demands/${demandId}/withdraw`)).status).toBe(200)
    expect((await post(`/api/app/me/demands/${demandId}/resubmit`, data)).status).toBe(403)
    const rights = (await get('/api/app/me/realname-rights', individualToken)).body.data.find((r: { active: boolean }) => r.active)
    expect(rights.limits.event_enroll).toBe(0)
    expect(rights.limits.space_reserve).toBe(0)
    // 投稿额度与需求发布额度彼此独立。
    const column = await db.articleColumn.findFirstOrThrow({ where: { status: 'enabled', system: false } })
    expect((await post('/api/app/articles', { title: '额度测试', content: '<p>测试</p>', columnId: column.id })).status).toBe(403)
  })

  it('社区企业成员共用企业身份的每日额度', async () => {
    const limits = (await request(app.getHttpServer()).get('/api/admin/rules/publishing-limits').set('Authorization', `Bearer ${admin}`)).body.data
    const identity = await db.userIdentity.findFirstOrThrow({ where: { userId: uid, type: 'community_enterprise' } })
    for (const row of limits) {
      if (row.scope === 'community_enterprise' && row.level === identity.level) row.demandPublishLimit = 1
    }
    expect((await put('/api/admin/rules/publishing-limits', { rules: limits })).status).toBe(200)
    const first = await post('/api/app/demands', { title: '企业额度一', description: '共享额度测试', kind: 'task', categoryCode: 'DC001', categoryDict: 'demand_category', asIdentity: 'community_enterprise', asEnterpriseId: identity.enterpriseId, contactName: '测试', contactPhone: '13801210001', deliverable: '报告', deliverBy: '2026-12-01' })
    expect(first.status).toBe(200)
    const member = await db.userIdentity.findFirstOrThrow({ where: { type: 'community_enterprise', enterpriseId: identity.enterpriseId, userId: { not: uid } } })
    const memberToken = await appLoginAs(app, (await db.user.findUniqueOrThrow({ where: { uid: member.userId } })).phone, 'user123')
    const second = await request(app.getHttpServer()).post('/api/app/demands').set('Authorization', `Bearer ${memberToken}`).send({ title: '企业额度二', description: '共享额度测试', kind: 'task', categoryCode: 'DC001', categoryDict: 'demand_category', asIdentity: 'community_enterprise', asEnterpriseId: identity.enterpriseId, contactName: '测试', contactPhone: '13801210001', deliverable: '报告', deliverBy: '2026-12-01' })
    expect(second.status).toBe(403)
    expect(await db.publishingLimitUsage.findUnique({ where: { subjectType_subjectId_action_date: { subjectType: 'enterprise', subjectId: identity.enterpriseId!, action: 'demand_publish', date: formatToday() } } })).toMatchObject({ count: 1 })
  })

  it('埋点枚举和负载大小校验，成功业务自动写入', async () => {
    expect((await post('/api/app/analytics/events', { name: 'search', payload: { category: 'demand' } })).status).toBe(200)
    expect((await post('/api/app/analytics/events', { name: 'arbitrary' })).status).toBe(400)
    expect((await post('/api/app/analytics/events', { name: 'search', payload: { text: 'x'.repeat(2100) } })).status).toBe(400)
    expect(await db.analyticsEvent.count({ where: { userId: uid, eventType: 'demand_publish' } })).toBe(2)
    expect(await db.analyticsEvent.count({ where: { userId: uid, eventType: 'search' } })).toBe(1)
  })
})
