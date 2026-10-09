/* M1-C 验收（wiki-backend.md §13 M1-C）：
 * 需求状态机主干：审核通过 / 立即发布 / 驳回 + 一条非法流转 409 + 立项双向关联断言。
 * 前置：docker compose up + prisma migrate + seed（种子需求：D4001 已发布 / D4005 待审核 /
 *       D4006 待发布 / D4008 待审核 / D4012 已驳回；积分/经验值规则与承接方种子齐备）。
 * 立项用例依赖 projects 模块 createProject 已实现并接入（demands 与 projects 并行开发，集成后运行）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1-C demands（状态机 + 立项联动）', () => {
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

  it('类别编码返回可读标签，供管理端列表显示和筛选', async () => {
    await app.get(PrismaService).demand.update({ where: { id: 'D4004' }, data: { category: 'DC004' } })
    const res = await request(app.getHttpServer())
      .get('/api/admin/demands?category=DC004&page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const row = res.body.data.list.find((item: { id: string }) => item.id === 'D4004')
    expect(row).toMatchObject({ category: 'DC004', categoryLabel: '技术开发' })
  })

  it('审核通过：pending → pending_release', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/demands/D4005/approve')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data).toEqual({ code: 0 })

    const detail = await request(app.getHttpServer())
      .get('/api/admin/demands/D4005')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.code).toBe(0)
    expect(detail.body.data.status).toBe('pending_release')
  })

  it('立即发布：pending_release → published（写 publishedAt）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/demands/D4006/publish-now')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data).toEqual({ code: 0 })

    const detail = await request(app.getHttpServer())
      .get('/api/admin/demands/D4006')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.code).toBe(0)
    expect(detail.body.data.status).toBe('published')
    expect(detail.body.data.publishedAt).toBeTruthy()
  })

  it('驳回：pending → rejected（reason 必填）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/demands/D4008/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '内容不符合需求广场发布规范' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data).toEqual({ code: 0 })

    const detail = await request(app.getHttpServer())
      .get('/api/admin/demands/D4008')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.code).toBe(0)
    expect(detail.body.data.status).toBe('rejected')
    expect(detail.body.data.rejectedReason).toBe('内容不符合需求广场发布规范')
  })

  it('非法流转：非待审核需求审核 → 409', async () => {
    // D4012 种子即 rejected，再审核应 409
    const res = await request(app.getHttpServer())
      .post('/api/admin/demands/D4012/approve')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(409)
    expect(res.body.message).toBe('仅待审核的需求可审核')
  })

  it('立项：published → projected + 双向关联（demand.projectId ↔ project.sourceDemandId）', async () => {
    // D4001 种子即 published
    const res = await request(app.getHttpServer())
      .post('/api/admin/demands/D4001/initiate-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '柔性电路板打样专项',
        undertakers: [
          { type: 'enterprise', id: 'E2001', share: 60 },
          { type: 'enterprise', id: 'E2007', share: 40 },
        ],
        description: '需求 D4001 立项承接柔性电路板打样',
        milestones: [
          { name: '项目立项', date: '2026-09-10', owners: [] },
          { name: '预期交付', date: '2026-10-31', owners: [] },
        ],
        expReward: 100,
      })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    const project = res.body.data
    expect(project.id).toBeTruthy()
    expect(project.sourceDemandId).toBe('D4001')

    const detail = await request(app.getHttpServer())
      .get('/api/admin/demands/D4001')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.code).toBe(0)
    expect(detail.body.data.status).toBe('projected')
    expect(detail.body.data.projectId).toBe(project.id)
  })

  it('立项（已选定）：selected → projected，为被选中的承接方补发积分与项目经验', async () => {
    const prisma = app.get(PrismaService)
    /* D4002 种子为 published：模拟发布者已选定承接方（顾北辰 U1005）并提交立项，等待管理员确认 */
    await prisma.demand.update({ where: { id: 'D4002' }, data: { status: 'selected', matchedRespondent: '顾北辰' } })
    await prisma.demandRespondent.updateMany({ where: { demandId: 'D4002' }, data: { withdrawnAt: '2026-09-17 09:00' } })
    const selected = await prisma.demandRespondent.create({
      data: {
        demandId: 'D4002',
        userId: 'U1005',
        responderIdentity: { type: 'individual', title: '个人用户' },
        name: '顾北辰',
        enterprise: '',
        phone: '13801210005',
        message: '可承接设计系统升级',
        at: '2026-09-17 09:10',
        status: 'accepted',
        reviewAt: '2026-09-17 09:20',
      },
    })

    const res = await request(app.getHttpServer())
      .post('/api/admin/demands/D4002/initiate-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: 'SaaS 控制台 UI 设计专项',
        undertakers: [{ type: 'individual', id: 'U1005', share: 100 }],
        description: '需求 D4002 立项承接控制台设计系统升级',
        milestones: [
          { name: '设计系统交付', date: '2026-10-10', owners: [] },
          { name: '核心页面交付', date: '2026-10-25', owners: [] },
        ],
        expReward: 100,
      })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.sourceDemandId).toBe('D4002')

    const demand = await prisma.demand.findUnique({ where: { id: 'D4002' } })
    expect(demand?.status).toBe('projected')
    expect(demand?.projectId).toBe(res.body.data.id)

    const points = await prisma.pointsRecord.findFirst({
      where: { userId: 'U1005', dedupeKey: 'demand_undertaken:U1005:D4002' },
    })
    expect(points?.delta).toBe(200)
    const experience = await prisma.experienceRecord.findFirst({
      where: { targetType: 'individual', targetId: 'U1005', reason: '承接需求立项获得项目经验' },
    })
    expect(experience?.delta).toBe(30)
    expect(selected.status).toBe('accepted')
  })

  it('响应双计数：待审核计入 pendingResponseCount，撤回/驳回不计入 responseCount', async () => {
    const prisma = app.get(PrismaService)
    const at = '2026-09-18 10:00'
    /* D4009 种子即 published 且无响应记录，作为计数基线 */
    const approvedRow = await prisma.demandRespondent.create({
      data: { demandId: 'D4009', name: '顾北辰', enterprise: '独立设计师', message: '已通过响应', at, status: 'pending' },
    })
    const pendingRow = await prisma.demandRespondent.create({
      data: { demandId: 'D4009', name: '苏晴', enterprise: '芯启半导体', message: '待审核响应', at, status: 'pending_review' },
    })

    // 基线：1 条已通过 + 1 条待审核 → 2/1
    const base = await request(app.getHttpServer())
      .get('/api/admin/demands/D4009')
      .set('Authorization', `Bearer ${token}`)
    expect(base.body.data.responseCount).toBe(2)
    expect(base.body.data.pendingResponseCount).toBe(1)
    const baseList = await request(app.getHttpServer())
      .get('/api/admin/demands?keyword=D4009&page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)
    const baseRow = baseList.body.data.list.find((item: { id: string }) => item.id === 'D4009')
    expect(baseRow).toMatchObject({ responseCount: 2, pendingResponseCount: 1 })

    // 撤回待审核那条 → 1/0（撤回不计入）
    await prisma.demandRespondent.update({
      where: { id: pendingRow.id },
      data: { withdrawnAt: '2026-09-18 11:00', status: 'closed' },
    })
    const afterWithdraw = await request(app.getHttpServer())
      .get('/api/admin/demands/D4009')
      .set('Authorization', `Bearer ${token}`)
    expect(afterWithdraw.body.data.responseCount).toBe(1)
    expect(afterWithdraw.body.data.pendingResponseCount).toBe(0)

    // 新提交一条待审核 → 2/1；管理员驳回 → 1/0（驳回不计入）
    const pendingRow2 = await prisma.demandRespondent.create({
      data: { demandId: 'D4009', name: '程一诺', enterprise: '逐浪出行', message: '再次待审核', at, status: 'pending_review' },
    })
    const reviewed = await request(app.getHttpServer())
      .post(`/api/admin/demands/D4009/respondents/${pendingRow2.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'rejected', reason: '信息不完整' })
    expect(reviewed.status).toBe(200)
    const afterReject = await request(app.getHttpServer())
      .get('/api/admin/demands/D4009')
      .set('Authorization', `Bearer ${token}`)
    expect(afterReject.body.data.responseCount).toBe(1)
    expect(afterReject.body.data.pendingResponseCount).toBe(0)
    expect(approvedRow.id).toBeTruthy()
  })

  it('响应审核边界：非法状态 400 / 缺 reason 400 / 不存在 404 / 非待审核 409 / 正常通过 200', async () => {
    const prisma = app.get(PrismaService)
    const at = '2026-09-18 12:00'
    const pendingRow = await prisma.demandRespondent.create({
      data: { demandId: 'D4009', name: '秦朗', enterprise: '深空航天科技', message: '待审核', at, status: 'pending_review' },
    })
    const approvedRow = await prisma.demandRespondent.create({
      data: { demandId: 'D4009', name: '白若溪', enterprise: '沧岚新材料', message: '已通过', at, status: 'pending' },
    })

    // status 非法值 → 400
    const invalid = await request(app.getHttpServer())
      .post(`/api/admin/demands/D4009/respondents/${pendingRow.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'unknown' })
    expect(invalid.status).toBe(400)

    // 驳回缺 reason → 400
    const noReason = await request(app.getHttpServer())
      .post(`/api/admin/demands/D4009/respondents/${pendingRow.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'rejected' })
    expect(noReason.status).toBe(400)

    // 响应不存在 → 404
    const notFound = await request(app.getHttpServer())
      .post('/api/admin/demands/D4009/respondents/999999/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(notFound.status).toBe(404)

    // 响应不属于该需求 → 404
    const mismatch = await request(app.getHttpServer())
      .post(`/api/admin/demands/D4001/respondents/${pendingRow.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(mismatch.status).toBe(404)

    // 非待审核（已通过）→ 409
    const conflict = await request(app.getHttpServer())
      .post(`/api/admin/demands/D4009/respondents/${approvedRow.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(conflict.status).toBe(409)

    // 正常通过 → 200，回落「待处理」并写 reviewAt
    const ok = await request(app.getHttpServer())
      .post(`/api/admin/demands/D4009/respondents/${pendingRow.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(ok.status).toBe(200)
    expect(ok.body.code).toBe(0)
    const after = await prisma.demandRespondent.findUnique({ where: { id: pendingRow.id } })
    expect(after?.status).toBe('pending')
    expect(after?.reviewAt).toBeTruthy()
  })
})
