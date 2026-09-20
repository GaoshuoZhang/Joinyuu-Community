import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { appLoginAs } from './helpers/app-login'

describe('M2-R A6/A19 管理端收口', () => {
  let app: INestApplication
  let db: PrismaService
  let admin: string
  let member: string
  let owner: string
  beforeAll(async () => {
    reseed()
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication()
    await app.init()
    db = app.get(PrismaService)
    admin = await loginAs(app)
    member = await appLoginAs(app, '13801210005', 'user123')
    owner = await appLoginAs(app, '13801210001', 'user123')
  })
  afterAll(async () => { await app?.close() })
  const get = (path: string, token = admin) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)
  const post = (path: string, data: object, token = admin) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send(data)
  const put = (path: string, data: object, token = admin) => request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${token}`).send(data)

  it('权限隔离：普通 app 与无治理权限管理员不可处理工单', async () => {
    expect((await get('/api/admin/member-governance/deletions', member)).status).not.toBe(200)
    expect((await get('/api/admin/cards/individual', member)).status).not.toBe(200)
  })

  it('详情页可读取单个个人与企业名片', async () => {
    const individual = await get('/api/admin/cards/individual/U1005')
    expect(individual.status).toBe(200)
    expect(individual.body.data).toMatchObject({ userId: 'U1005', displayName: expect.any(String) })
    expect(individual.body.data.visibility).toEqual(expect.objectContaining({ age: expect.any(Boolean), politicalStatus: expect.any(Boolean) }))
    const enterprise = await get('/api/admin/cards/enterprise/E2001')
    expect(enterprise.status).toBe(200)
    expect(enterprise.body.data).toMatchObject({ id: 'E2001', name: expect.any(String) })
    expect((await get('/api/admin/cards/individual/U1001')).status).toBe(404)
  })

  it('实名提交通过规则校验后立即认证，且不再暴露人工复核端点', async () => {
    await db.user.update({ where: { uid: 'U1005' }, data: { realName: null, citizenId: null, verifiedAt: null } })
    const identity = { realName: '顾北辰', citizenId: '11010519491231002X' }
    expect((await put('/api/app/me/realname', identity, member)).status).toBe(200)
    expect((await get('/api/app/me/realname', member)).body.data).toMatchObject({
      verified: true,
      realName: '顾*',
      citizenIdMasked: '1101**********002X',
      verifiedAt: expect.any(String),
    })
    expect(await db.user.findUnique({ where: { uid: 'U1005' } })).toMatchObject({ ...identity, verifiedAt: expect.any(String) })
    expect((await get('/api/admin/member-governance/realnames')).status).toBe(404)
    expect((await post('/api/admin/member-governance/realnames/U1005/review', { action: 'approve', note: '不应存在' })).status).toBe(404)
  })

  it('名片配置即时下发；禁止字段不可写；部分保存不清空禁用字段', async () => {
    const previous = await db.individualCard.findUniqueOrThrow({ where: { userId: 'U1005' } })
    expect((await put('/api/admin/cards/schema/individual', { editableFields: ['intro'] })).status).toBe(200)
    expect((await get('/api/app/card-schema/individual', member)).body.data.editableFields).toEqual(['intro'])
    expect((await put('/api/app/me/cards/individual', { displayName: '越权' }, member)).status).toBe(403)
    expect((await put('/api/app/me/cards/individual', { intro: '白名单内更新个人介绍' }, member)).status).toBe(200)
    const updated = await db.individualCard.findUniqueOrThrow({ where: { userId: 'U1005' } })
    expect(updated.skills).toEqual(previous.skills)
    expect(updated.education).toEqual(previous.education)
    expect((await put('/api/admin/cards/schema/individual', { editableFields: ['passwordHash'] })).status).toBe(400)
    expect((await put('/api/admin/cards/schema/individual', { editableFields: [] })).status).toBe(200)
    expect((await put('/api/app/me/cards/individual', { intro: '禁止' }, member)).status).toBe(403)
  })

  it('后台名片编辑绕过用户白名单；公开名片和本人资料即时一致', async () => {
    expect((await put('/api/admin/cards/individual/U1005', { displayName: '顾北辰设计工作室', intro: '后台维护的个人公开介绍' })).status).toBe(200)
    expect((await get('/api/app/community/talents/U1005', member)).body.data.name).toBe('顾北辰设计工作室')
    expect((await get('/api/app/me/cards', member)).body.data.individual.displayName).toBe('顾北辰设计工作室')
    expect((await put('/api/admin/cards/schema/enterprise', { editableFields: ['description'] })).status).toBe(200)
    expect((await put('/api/app/me/enterprises/E2001', { website: 'https://example.com' }, owner)).status).toBe(403)
    expect((await put('/api/admin/cards/enterprise/E2001', { website: 'https://example.com', description: '企业名片后台维护内容' })).status).toBe(200)
    expect((await get('/api/app/enterprises/E2001', member)).body.data.website).toBe('https://example.com')
    expect(await db.auditLog.count({ where: { module: '名片管理' } })).toBeGreaterThanOrEqual(4)
  })

  it('注销冷静期禁止提前执行；驳回回执可见，撤回后不可再审批', async () => {
    expect((await post('/api/app/me/deletion-request', { reason: '测试冷静期' }, member)).status).toBe(200)
    const row = await db.accountDeletionRequest.findFirstOrThrow({ where: { userId: 'U1005', status: 'cooling' } })
    expect((await post(`/api/admin/member-governance/deletions/${row.id}/review`, { action: 'approve', note: '提前执行' })).status).toBe(409)
    expect((await post(`/api/admin/member-governance/deletions/${row.id}/review`, { action: 'reject', note: '申请信息需确认' })).status).toBe(200)
    expect(await db.userNotification.count({ where: { userId: 'U1005', title: '注销申请未通过' } })).toBe(1)
    expect((await post('/api/app/me/deletion-request', { reason: '重新申请' }, member)).status).toBe(200)
    const next = await db.accountDeletionRequest.findFirstOrThrow({ where: { userId: 'U1005', status: 'cooling' } })
    expect((await post('/api/app/me/deletion-request/cancel', {}, member)).status).toBe(200)
    expect((await post(`/api/admin/member-governance/deletions/${next.id}/review`, { action: 'reject', note: '重复处理' })).status).toBe(409)
  })

  it('冷静期届满并发仅一次注销；账号匿名化，会话失效，不能恢复', async () => {
    await db.accountDeletionRequest.create({ data: { id: 'DR99999', userId: 'U1005', requestedAt: '2020-01-01 10:00', effectiveAt: '2020-01-08 10:00' } })
    const results = await Promise.all([1, 2].map(() => post('/api/admin/member-governance/deletions/DR99999/review', { action: 'approve', note: '已核对注销申请' })))
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    expect(await db.user.findUnique({ where: { uid: 'U1005' } })).toMatchObject({ status: 'deleted', passwordHash: null, phone: 'deleted:U1005', realName: null, citizenId: null, verifiedAt: null })
    expect((await get('/api/app/me', member)).status).toBe(401)
    const restore = await request(app.getHttpServer()).patch('/api/admin/users/U1005/status').set('Authorization', `Bearer ${admin}`).send({ status: 'active' })
    expect(restore.status).toBe(409)
    expect((await get('/api/app/community/talents/U1005', owner)).status).toBe(404)
  })
})
