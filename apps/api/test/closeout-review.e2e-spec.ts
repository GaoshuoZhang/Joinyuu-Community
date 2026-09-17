import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { appLoginAs } from './helpers/app-login'

describe('M2-R 收尾复查回归', () => {
  let app: INestApplication
  let db: PrismaService
  let admin: string
  let member: string
  let sequence = 0
  beforeAll(async () => {
    reseed()
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication()
    await app.init()
    db = app.get(PrismaService)
    admin = await loginAs(app)
    member = await appLoginAs(app, '13801210005', 'user123')
  })
  afterAll(async () => { await app?.close() })
  const get = (path: string, token = admin) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)
  const post = (path: string, data: object, token = admin) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send(data)
  const put = (path: string, data: object, token = admin) => request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${token}`).send(data)
  const review = (id: string, action: string) => post(`/api/admin/governance/reports/${id}/review`, { status: 'resolved', action, resolution: '复查处置' })
  const report = (targetType: string, targetId: string) => db.report.create({ data: {
    id: `RPFIX${++sequence}`, reporterId: 'U1001', targetType, targetId, targetTitle: '复查对象', reason: '待核实', at: '2026-09-17 10:00',
  } })
  const canRestore = async (id: string) => (await get('/api/admin/governance/reports?pageSize=100')).body.data.list.find((r: { id: string }) => r.id === id)?.canRestore

  it('并发提交只创建一份注销申请和通知；撤销后全部失效且不可审批', async () => {
    const before = await db.userNotification.count({ where: { userId: 'U1005', title: '注销申请已提交' } })
    const results = await Promise.all(Array.from({ length: 5 }, () => post('/api/app/me/deletion-request', {}, member)))
    expect(results.map(r => r.status).sort()).toEqual([200, 409, 409, 409, 409])
    expect(await db.accountDeletionRequest.count({ where: { userId: 'U1005', status: 'cooling' } })).toBe(1)
    expect(await db.userNotification.count({ where: { userId: 'U1005', title: '注销申请已提交' } })).toBe(before + 1)
    const row = await db.accountDeletionRequest.findFirstOrThrow({ where: { userId: 'U1005', status: 'cooling' } })
    await expect(db.accountDeletionRequest.create({ data: { id: 'DRFIXDUP', userId: 'U1005', requestedAt: '2020-01-01 00:00' } })).rejects.toMatchObject({ code: 'P2002' })
    expect((await post('/api/app/me/deletion-request/cancel', {}, member)).status).toBe(200)
    expect(await db.accountDeletionRequest.count({ where: { userId: 'U1005', status: 'cooling' } })).toBe(0)
    expect((await post(`/api/admin/member-governance/deletions/${row.id}/review`, { action: 'approve', note: '旧申请' })).status).toBe(409)
  })

  it('撤销与后台执行并发：只有一个操作成功，成功撤销不会被执行', async () => {
    const token = await appLoginAs(app, '13801210015', 'user123')
    await db.accountDeletionRequest.create({ data: { id: 'DRFIXRACE', userId: 'U1015', requestedAt: '2020-01-01 00:00', effectiveAt: '2020-01-08 00:00' } })
    const [cancel, approve] = await Promise.all([
      post('/api/app/me/deletion-request/cancel', {}, token),
      post('/api/admin/member-governance/deletions/DRFIXRACE/review', { action: 'approve', note: '核实执行' }),
    ])
    expect([cancel, approve].filter(r => r.status === 200)).toHaveLength(1)
    const row = await db.accountDeletionRequest.findUniqueOrThrow({ where: { id: 'DRFIXRACE' } })
    const user = await db.user.findUniqueOrThrow({ where: { uid: 'U1015' } })
    expect(row.status).toBe(cancel.status === 200 ? 'cancelled' : 'approved')
    expect(user.status).toBe(cancel.status === 200 ? 'active' : 'deleted')
  })

  it('迁移安全撤销历史重复申请，保留单份申请，并阻止再插入重复', async () => {
    const migration = readFileSync(join(__dirname, '../prisma/migrations/20260917030000_closeout_review_guards/migration.sql'), 'utf8')
    const [cleanup, index] = migration.split('ALTER TABLE')[0].split(';').filter(s => s.trim())
    const rollback = new Error('rollback migration fixture')
    await expect(db.$transaction(async tx => {
      await tx.$executeRawUnsafe('DROP INDEX "AccountDeletionRequest_one_cooling_per_user"')
      await tx.accountDeletionRequest.createMany({ data: [
        { id: 'DRFIXOLD1', userId: 'U1005', requestedAt: '2020-01-01 00:00' },
        { id: 'DRFIXOLD2', userId: 'U1005', requestedAt: '2020-01-02 00:00' },
        { id: 'DRFIXONLY', userId: 'U1001', requestedAt: '2020-01-01 00:00' },
      ] })
      await tx.$executeRawUnsafe(cleanup)
      await tx.$executeRawUnsafe(index)
      expect(await tx.accountDeletionRequest.count({ where: { userId: 'U1005', status: 'cooling' } })).toBe(0)
      expect(await tx.accountDeletionRequest.findUnique({ where: { id: 'DRFIXONLY' } })).toMatchObject({ status: 'cooling' })
      throw rollback
    })).rejects.toBe(rollback)
  })

  it.each(['app', 'admin'])('%s 部分隐私更新保留其他隐藏字段，空对象与省略均不重置', async channel => {
    const path = channel === 'app' ? '/api/app/me/cards/individual' : '/api/admin/cards/individual/U1005'
    const token = channel === 'app' ? member : admin
    expect((await put(path, { age: '32', politicalStatus: '群众', visibility: { age: false, politicalStatus: false } }, token)).status).toBe(200)
    expect((await put(path, { visibility: { politicalStatus: true } }, token)).status).toBe(200)
    expect((await put(path, { visibility: {} }, token)).status).toBe(200)
    expect((await put(path, { intro: '隐私回归' }, token)).status).toBe(200)
    const card = (await get('/api/app/community/talents/U1005', member)).body.data
    expect(card.age).toBeUndefined()
    expect(card.politicalStatus).toBe('群众')
    for (const visibility of [null, [], 'public', { age: 'false' }, { politicalStatus: null }]) {
      expect((await put(path, { visibility }, token)).status).toBe(400)
    }
  })

  it('前后台并发修改不同隐私开关均保存，不覆盖另一项隐藏设置', async () => {
    await put('/api/admin/cards/individual/U1005', { visibility: { age: true, politicalStatus: true } })
    const results = await Promise.all([
      put('/api/app/me/cards/individual', { visibility: { age: false } }, member),
      put('/api/admin/cards/individual/U1005', { visibility: { politicalStatus: false } }),
    ])
    expect(results.map(r => r.status)).toEqual([200, 200])
    expect((await db.individualCard.findUniqueOrThrow({ where: { userId: 'U1005' } })).visibility).toEqual({ age: false, politicalStatus: false })
  })

  it('展示姓名可从人才库、全域搜索与后台名片管理检索', async () => {
    const name = '复查独特展示姓名'
    expect((await put('/api/admin/cards/individual/U1005', { displayName: name })).status).toBe(200)
    const kw = encodeURIComponent(name)
    expect((await get(`/api/app/community/talents?keyword=${kw}`, member)).body.data).toEqual(expect.arrayContaining([expect.objectContaining({ uid: 'U1005', name })]))
    expect((await get(`/api/admin/cards/individual?keyword=${kw}`)).body.data).toMatchObject({ total: 1, list: [expect.objectContaining({ userId: 'U1005' })] })
    expect((await get(`/api/app/search?keyword=${kw}&type=talent`, member)).body.data).toMatchObject({ counts: { talent: 1 }, list: [expect.objectContaining({ uid: 'U1005', name })] })
    expect((await get(`/api/app/search?keyword=${kw}&type=talent&page=2&pageSize=1`, member)).body.data.list).toEqual([])
  })

  it('未下架的已结案举报不能恢复独立处置，旧版无来源记录同样不可恢复', async () => {
    const row = await report('demand', 'D4002')
    expect((await review(row.id, 'none')).status).toBe(200)
    await db.demand.update({ where: { id: 'D4002' }, data: { status: 'rejected' } })
    expect(await canRestore(row.id)).toBe(false)
    expect((await review(row.id, 'restore')).status).toBe(409)
    const legacy = await report('demand', 'D4002')
    await db.report.update({ where: { id: legacy.id }, data: { status: 'resolved' } })
    expect((await review(legacy.id, 'restore')).status).toBe(409)
    expect((await db.demand.findUniqueOrThrow({ where: { id: 'D4002' } })).status).toBe('rejected')
  })

  it.each(['demand', 'article', 'enterprise', 'user'])('%s 只有原举报能恢复一次，后续独立处置使恢复资格失效', async type => {
    const article = type === 'article' ? await db.article.findFirstOrThrow({ where: { status: 'published', deletedAt: null } }) : null
    const id = type === 'demand' ? 'D4002' : type === 'enterprise' ? 'E2001' : type === 'user' ? 'U1004' : article!.id
    const setState = async (hidden: boolean) => {
      if (type === 'demand') await db.demand.update({ where: { id }, data: { status: hidden ? 'rejected' : 'published' } })
      if (type === 'article') await db.article.update({ where: { id }, data: { status: hidden ? 'closed' : 'published' } })
      if (type === 'enterprise') await db.enterprise.update({ where: { id }, data: { showcaseStatus: hidden ? 'rejected' : 'published' } })
      if (type === 'user') await db.user.update({ where: { uid: id }, data: { status: hidden ? 'frozen' : 'active' } })
    }
    await setState(false)
    const first = await report(type, id)
    expect((await review(first.id, 'hide')).status).toBe(200)
    expect(await canRestore(first.id)).toBe(true)
    const results = await Promise.all([review(first.id, 'restore'), review(first.id, 'restore')])
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    expect(await canRestore(first.id)).toBe(false)
    await setState(true)
    expect((await review(first.id, 'restore')).status).toBe(409)

    await setState(false)
    const second = await report(type, id)
    expect((await review(second.id, 'hide')).status).toBe(200)
    // Reasserting the same hidden state is an independent staff decision.
    await setState(true)
    expect(await canRestore(second.id)).toBe(false)
    expect((await review(second.id, 'restore')).status).toBe(409)
    expect((await db.report.findUniqueOrThrow({ where: { id: second.id } })).restoredAt).toBeNull()
    await setState(false)
  })
})
