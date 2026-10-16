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

    /* 立项后入选响应收敛为 undertaken（item 4）：不再停在「已选定」 */
    const converged = await prisma.demandRespondent.findUnique({ where: { id: selected.id } })
    expect(converged?.status).toBe('undertaken')
  })

  it('承接方/响应人展示口径：label 含真实姓名 · 身份 · 昵称 · 用户 ID', async () => {
    /* 承接方下拉（item 1）：多个同名/同昵称用户据此区分 */
    const options = await request(app.getHttpServer())
      .get('/api/admin/demands/undertaker-options')
      .set('Authorization', `Bearer ${token}`)
    expect(options.status).toBe(200)
    const userOption = options.body.data.find((o: { value: string }) => o.value === 'individual:U1005')
    expect(userOption.label).toBe('顾北辰（社区个体 · 顾北辰 · U1005）')

    /* 需求详情响应人列（item 2）：账号字段随响应下发（真实姓名 / 昵称 / 用户 ID / 身份快照） */
    const detail = await request(app.getHttpServer())
      .get('/api/admin/demands/D4002')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.status).toBe(200)
    /* 取立项时新写入的响应（种子响应无身份快照）；账号字段随响应下发供响应人列展示统一口径 */
    const respondent = detail.body.data.respondents.find((r: { responderIdentity?: unknown }) => r.responderIdentity != null)
    expect(respondent).toMatchObject({ userId: 'U1005', realName: '顾北辰', nickname: '顾北辰' })
    expect(respondent.responderIdentity).toMatchObject({ type: 'individual' })
  })

  it('立项前置选定承接方（respondentIds）：入选响应 → 已承接，未入选的已选定响应 → 已结束，未响应承接方不新增条目', async () => {
    const prisma = app.get(PrismaService)
    /* D4003 种子即 published；清空历史响应后构造「社区自建需求 + 两条待选定响应」场景 */
    await prisma.demand.update({ where: { id: 'D4003' }, data: { status: 'published' } })
    await prisma.demandRespondent.deleteMany({ where: { demandId: 'D4003' } })
    const rowA = await prisma.demandRespondent.create({
      data: {
        demandId: 'D4003',
        userId: 'U1005',
        responderIdentity: { type: 'individual', title: '个人用户' },
        name: '顾北辰',
        enterprise: '',
        message: '可承接本次陪跑',
        at: '2026-09-19 09:00',
        status: 'pending',
        reviewAt: '2026-09-19 09:05',
      },
    })
    const rowB = await prisma.demandRespondent.create({
      data: {
        demandId: 'D4003',
        userId: 'U1006',
        responderIdentity: { type: 'individual', title: '个人用户' },
        name: '沈嘉禾',
        enterprise: '',
        message: '我也可以参与',
        at: '2026-09-19 09:01',
        status: 'pending',
        reviewAt: '2026-09-19 09:06',
      },
    })

    /* 立项表单预填：按勾选的响应 ID 返回承接方选项（与 undertaker-options 同口径） */
    const prefilled = await request(app.getHttpServer())
      .get(`/api/admin/demands/D4003/selected-respondents?respondentIds=${rowA.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(prefilled.status).toBe(200)
    expect(prefilled.body.data).toHaveLength(1)
    expect(prefilled.body.data[0]).toMatchObject({ value: 'individual:U1005', label: '顾北辰（社区个体 · 顾北辰 · U1005）' })

    /* 勾选不可选定的响应（已选定态）→ 400 */
    await prisma.demandRespondent.update({ where: { id: rowB.id }, data: { status: 'accepted' } })
    const invalid = await request(app.getHttpServer())
      .post('/api/admin/demands/D4003/initiate-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '非法勾选用例',
        undertakers: [{ type: 'individual', id: 'U1005', share: 100 }],
        description: '非待选定响应不可勾选',
        milestones: [{ name: '预期交付', date: '2026-10-31', owners: [] }],
        respondentIds: [rowB.id],
      })
    expect(invalid.status).toBe(400)
    await prisma.demandRespondent.update({ where: { id: rowB.id }, data: { status: 'pending' } })

    /* 立项：勾选 rowA；承接方为 rowA 对应账号 + 一位从未响应的用户 U1010 */
    const res = await request(app.getHttpServer())
      .post('/api/admin/demands/D4003/initiate-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '融资陪跑专项（B 轮）',
        undertakers: [
          { type: 'individual', id: 'U1005', share: 50 },
          { type: 'individual', id: 'U1010', share: 50 },
        ],
        description: '需求 D4003 立项承接融资陪跑',
        milestones: [
          { name: '项目立项', date: '2026-09-19', owners: [] },
          { name: '预期交付', date: '2026-11-30', owners: [] },
        ],
        expReward: 100,
        respondentIds: [rowA.id],
      })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.sourceDemandId).toBe('D4003')

    /* 入选 → 已承接；其余有效响应（含未勾选未入选的待选定）→ 已结束（立项后不留悬挂态） */
    expect((await prisma.demandRespondent.findUnique({ where: { id: rowA.id } }))?.status).toBe('undertaken')
    expect((await prisma.demandRespondent.findUnique({ where: { id: rowB.id } }))?.status).toBe('closed')

    /* 未响应却被选为承接方的用户：不为其创建响应记录（「我的响应」不新增条目） */
    const respondentCount = await prisma.demandRespondent.count({ where: { demandId: 'D4003' } })
    expect(respondentCount).toBe(2)
    const nontRespondent = await prisma.demandRespondent.findFirst({ where: { demandId: 'D4003', userId: 'U1010' } })
    expect(nontRespondent).toBeNull()

    /* 积分/经验只发实际承接的响应者；未响应承接方仅凭「承接方」身份参与项目 */
    const rewarded = await prisma.pointsRecord.findFirst({
      where: { userId: 'U1005', dedupeKey: 'demand_undertaken:U1005:D4003' },
    })
    expect(rewarded?.delta).toBe(200)
  })

  it('立项校验承接方响应已过审：承接方响应仍在「待审核」→ 409 且不产生半成品', async () => {
    const prisma = app.get(PrismaService)
    /* D4010 种子为 closed，改回 published 作为用例载体 */
    await prisma.demand.update({ where: { id: 'D4010' }, data: { status: 'published' } })
    await prisma.demandRespondent.deleteMany({ where: { demandId: 'D4010' } })
    const row = await prisma.demandRespondent.create({
      data: {
        demandId: 'D4010',
        userId: 'U1005',
        responderIdentity: { type: 'individual', title: '个人用户' },
        name: '顾北辰',
        enterprise: '',
        message: '尚未审核的响应',
        at: '2026-09-19 10:00',
        status: 'pending_review',
      },
    })

    const blocked = await request(app.getHttpServer())
      .post('/api/admin/demands/D4010/initiate-project')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '响应未过审的立项用例',
        undertakers: [{ type: 'individual', id: 'U1005', share: 100 }],
        description: '承接方对应响应仍在待审核',
        milestones: [{ name: '预期交付', date: '2026-12-31', owners: [] }],
      })
    expect(blocked.status).toBe(409)
    expect(blocked.body.message).toContain('待审核')

    /* 整体拒绝：需求与响应状态均未被改动 */
    expect((await prisma.demand.findUnique({ where: { id: 'D4010' } }))?.status).toBe('published')
    expect((await prisma.demandRespondent.findUnique({ where: { id: row.id } }))?.status).toBe('pending_review')
  })

  it('社区自建需求立项：项目需求方标为「社区官方」，关联项目关闭后可重新立项', async () => {
    const prisma = app.get(PrismaService)
    /* ① 后台创建需求（提交人 = 当前工作人员，身份快照 official）；创建即 pending_release */
    const created = await request(app.getHttpServer())
      .post('/api/admin/demands')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '社区自建需求立项口径',
        category: 'DC004',
        demandType: 'task',
        deliverable: '交付说明',
        deliverBy: '2026-12-31',
        budget: '面议',
        period: '两周',
        description: '验证需求方口径与重新立项',
        visibilityIdentities: [],
        visibilityLevels: [],
        enrollmentIdentities: [],
        enrollmentLevels: [],
        deadline: '2026-12-01',
        contactName: '社区运营',
        contactPhone: '13801210001',
        contactPublic: false,
        respondNeedReview: false,
      })
    expect(created.status).toBe(200)
    const demandId: string = created.body.data.id
    expect(created.body.data.publisherIdentity).toMatchObject({ type: 'official' })
    await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/publish-now`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    /* ② 一条待选定响应（不入选）→ 立项后应收敛为已结束 */
    const proxy = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/proxy-respond`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userName: '顾北辰', enterprise: '独立设计师', phone: '13801210005', message: '可承接' })
    expect(proxy.status).toBe(200)
    const responseRow = await prisma.demandRespondent.findFirst({ where: { demandId } })
    expect(responseRow?.status).toBe('pending')

    const first = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/initiate-project`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '社区自建立项专项',
        undertakers: [{ type: 'individual', id: 'U1005', share: 100 }],
        description: '社区自建项目',
        milestones: [{ name: '预期交付', date: '2026-12-31', owners: [] }],
      })
    expect(first.status).toBe(200)
    const firstProjectId: string = first.body.data.id
    /* H：社区自建需求无客户端账号，需求方统一标为「社区官方」 */
    expect(first.body.data.demanderName).toBe('社区官方')
    expect(first.body.data.demanderIdentity).toMatchObject({ type: 'official' })
    expect((await prisma.demandRespondent.findUnique({ where: { id: responseRow!.id } }))?.status).toBe('closed')

    /* ③ 关联项目仍在进行 → 重新立项 409 */
    const blocked = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/initiate-project`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '不应成功的重新立项',
        undertakers: [{ type: 'individual', id: 'U1005', share: 100 }],
        description: '关联项目未关闭',
        milestones: [{ name: '预期交付', date: '2026-12-31', owners: [] }],
      })
    expect(blocked.status).toBe(409)
    expect(blocked.body.message).toContain('仍在进行')

    /* ④ 暂停并关闭关联项目（状态机：running → paused → closed）→ 可重新立项，需求切换到新项目 */
    await request(app.getHttpServer())
      .post(`/api/admin/projects/${firstProjectId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    await request(app.getHttpServer())
      .post(`/api/admin/projects/${firstProjectId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '需求变更' })
      .expect(200)
    const again = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/initiate-project`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '重新立项专项',
        undertakers: [{ type: 'individual', id: 'U1005', share: 100 }],
        description: '重新立项',
        milestones: [{ name: '预期交付', date: '2026-12-31', owners: [] }],
      })
    expect(again.status).toBe(200)
    const demandAfter = await prisma.demand.findUnique({ where: { id: demandId } })
    expect(demandAfter?.status).toBe('projected')
    expect(demandAfter?.projectId).toBe(again.body.data.id)
    expect(demandAfter?.projectId).not.toBe(firstProjectId)

    /* ⑤ 需求详情下发关联项目状态，供前端判断是否显示「重新立项」入口 */
    const detail = await request(app.getHttpServer())
      .get(`/api/admin/demands/${demandId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.projectId).toBe(again.body.data.id)
    expect(detail.body.data.projectStatus).toBe('running')

    /* ⑥ 归档关联项目后同样可重新立项（archived） */
    await request(app.getHttpServer())
      .post(`/api/admin/projects/${again.body.data.id}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    await request(app.getHttpServer())
      .post(`/api/admin/projects/${again.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '需求再次变更' })
      .expect(200)
    await request(app.getHttpServer())
      .post(`/api/admin/projects/${again.body.data.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const archivedDetail = await request(app.getHttpServer())
      .get(`/api/admin/demands/${demandId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(archivedDetail.body.data.projectStatus).toBe('archived')
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

  it('响应审核增强：通过时勾选「向需求方显示」的字段、编辑响应内容、按需求筛选待审核响应', async () => {
    const prisma = app.get(PrismaService)
    const at = '2026-09-19 10:00'
    const row = await prisma.demandRespondent.create({
      data: {
        demandId: 'D4009',
        name: '林晚舟',
        enterprise: '星澜智能科技',
        message: '响应说明原文',
        quote: '5 万',
        timeline: '3 周内可开工',
        cases: '同类项目交付经验',
        phone: '13801210002',
        email: 'linwanzhou@starlan.ai',
        at,
        status: 'pending_review',
      },
    })

    /* 非法隐藏字段键 → 400（仅允许 message/quote/timeline/cases/phone/email） */
    const badField = await request(app.getHttpServer())
      .post(`/api/admin/demands/D4009/respondents/${row.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', hiddenFields: ['bogus'] })
    expect(badField.status).toBe(400)

    /* 编辑响应内容：仅待审核可改（响应方基本信息 name/enterprise 不在载荷内，改不了） */
    const edited = await request(app.getHttpServer())
      .put(`/api/admin/demands/D4009/respondents/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '响应说明已编辑', quote: '6 万', timeline: '4 周内可开工', cases: '补充案例', phone: '13801210003', email: '' })
    expect(edited.status).toBe(200)
    const afterEdit = await prisma.demandRespondent.findUnique({ where: { id: row.id } })
    expect(afterEdit?.message).toBe('响应说明已编辑')
    expect(afterEdit?.quote).toBe('6 万')
    expect(afterEdit?.cases).toBe('补充案例')
    expect(afterEdit?.phone).toBe('13801210003')
    /* 空串 = 清空邮箱；响应方基本信息保持不变 */
    expect(afterEdit?.email).toBeNull()
    expect(afterEdit?.name).toBe('林晚舟')
    expect(afterEdit?.enterprise).toBe('星澜智能科技')

    /* message 为空 → 400 */
    const emptyMessage = await request(app.getHttpServer())
      .put(`/api/admin/demands/D4009/respondents/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '   ' })
    expect(emptyMessage.status).toBe(400)
    expect(emptyMessage.body.message).toBe('响应说明不能为空')

    /* 待审核响应可被「响应审核」列表按 demandId 精确筛选 */
    const filtered = await request(app.getHttpServer())
      .get('/api/admin/demand-responses')
      .query({ page: 1, pageSize: 20, demandId: 'D4009' })
      .set('Authorization', `Bearer ${token}`)
    expect(filtered.status).toBe(200)
    expect(filtered.body.data.total).toBeGreaterThan(0)
    expect(filtered.body.data.list.every((r: { demandId: string }) => r.demandId === 'D4009')).toBe(true)

    const noneMatched = await request(app.getHttpServer())
      .get('/api/admin/demand-responses')
      .query({ page: 1, pageSize: 20, demandId: 'D0000' })
      .set('Authorization', `Bearer ${token}`)
    expect(noneMatched.body.data.total).toBe(0)

    /* 通过并勾选「不显示」的联系手机与报价：hiddenFields 持久化，后台仍可见真实值 */
    const approved = await request(app.getHttpServer())
      .post(`/api/admin/demands/D4009/respondents/${row.id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', hiddenFields: ['phone', 'quote'] })
    expect(approved.status).toBe(200)
    const afterApprove = await prisma.demandRespondent.findUnique({ where: { id: row.id } })
    expect(afterApprove?.status).toBe('pending')
    expect(afterApprove?.hiddenFields).toEqual(['phone', 'quote'])

    const adminDetail = await request(app.getHttpServer())
      .get('/api/admin/demands/D4009')
      .set('Authorization', `Bearer ${token}`)
    const adminRow = (adminDetail.body.data.respondents as Array<{ id: number; hiddenFields?: string[]; phone?: string; quote?: string }>)
      .find((item) => item.id === row.id)
    expect(adminRow?.hiddenFields).toEqual(['phone', 'quote'])
    /* 后台始终保留真实值（隐藏只作用于发布者侧下发） */
    expect(adminRow?.phone).toBe('13801210003')
    expect(adminRow?.quote).toBe('6 万')

    /* 已通过（不再是待审核）→ 再编辑 409 */
    const editAfterApprove = await request(app.getHttpServer())
      .put(`/api/admin/demands/D4009/respondents/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '编辑已通过的响应' })
    expect(editAfterApprove.status).toBe(409)
    expect(editAfterApprove.body.message).toBe('仅待审核的响应可编辑')
  })

  it('需求立项预填：需求方已选定的承接方（可多个）转为承接方选项，未选定返回空数组', async () => {
    const prisma = app.get(PrismaService)
    /* 新建一条无响应的需求，保证「未选定 → 空数组」判定与种子数据无关 */
    await prisma.demand.create({
      data: {
        id: 'D9001',
        title: '立项预填测试需求',
        category: '技术开发',
        publisherName: '测试发布者',
        budget: '1 万',
        period: '两周',
        deadline: '2026-12-31',
        description: '测试需求',
        status: 'selected',
        createdAt: '2026-09-20 09:00',
        /* 数组字段无 DB 默认值，需显式给空数组 */
        visibilityIdentities: [],
        visibilityLevels: [],
        enrollmentIdentities: [],
        enrollmentLevels: [],
        tags: [],
      },
    })

    const empty = await request(app.getHttpServer())
      .get('/api/admin/demands/D9001/selected-respondents')
      .set('Authorization', `Bearer ${token}`)
    expect(empty.status).toBe(200)
    expect(empty.body.data).toEqual([])

    const missing = await request(app.getHttpServer())
      .get('/api/admin/demands/D9999/selected-respondents')
      .set('Authorization', `Bearer ${token}`)
    expect(missing.status).toBe(404)

    /* 需求方选定：社区企业身份响应 + 个人身份响应（均为 accepted），
     * 另有未选定（pending）与已撤回（withdrawnAt）各一条，均不应进入预填 */
    await prisma.demandRespondent.create({
      data: {
        demandId: 'D9001',
        userId: 'U1005',
        responderIdentity: { type: 'community_enterprise', enterpriseId: 'E2001', enterpriseName: '星澜智能科技' },
        name: '顾北辰',
        enterprise: '星澜智能科技',
        message: '企业身份响应',
        at: '2026-09-20 10:00',
        status: 'accepted',
      },
    })
    await prisma.demandRespondent.create({
      data: {
        demandId: 'D9001',
        userId: 'U1009',
        responderIdentity: { type: 'community_individual' },
        name: '林晚舟',
        enterprise: '',
        message: '个人身份响应',
        at: '2026-09-20 10:30',
        status: 'accepted',
      },
    })
    await prisma.demandRespondent.create({
      data: {
        demandId: 'D9001',
        userId: 'U1002',
        responderIdentity: { type: 'individual', title: '个人用户' },
        name: '陈屿',
        enterprise: '',
        message: '未选定的响应',
        at: '2026-09-20 11:00',
        status: 'pending',
      },
    })
    await prisma.demandRespondent.create({
      data: {
        demandId: 'D9001',
        userId: 'U1010',
        responderIdentity: { type: 'community_individual' },
        name: '已撤回者',
        enterprise: '',
        message: '已撤回的响应',
        at: '2026-09-20 11:30',
        status: 'accepted',
        withdrawnAt: '2026-09-20 12:00',
      },
    })

    const res = await request(app.getHttpServer())
      .get('/api/admin/demands/D9001/selected-respondents')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const options = res.body.data as Array<{ group: string; label: string; value: string }>
    expect(options.map((o) => o.value).sort()).toEqual(['enterprise:E2001', 'individual:U1009'])
    expect(options.find((o) => o.value === 'enterprise:E2001')?.group).toBe('社区企业')
  })

  it('状态筛选支持多值（勾选式筛选）：重复参数取并集、空串占位不过滤、非法值 400', async () => {
    const prisma = app.get(PrismaService)
    /* 两条对照需求：已发布在筛选项内、已驳回不在筛选项内 */
    const base = {
      category: '技术开发',
      publisherName: '筛选测试发布者',
      budget: '面议',
      period: '两周',
      deadline: '2026-12-31',
      description: '状态多值筛选测试',
      createdAt: '2026-07-16 09:00',
      /* 数组字段无 DB 默认值，需显式给空数组 */
      visibilityIdentities: [],
      visibilityLevels: [],
      enrollmentIdentities: [],
      enrollmentLevels: [],
      tags: [],
    }
    await prisma.demand.create({ data: { id: 'D9101', title: '多值筛选-已发布', status: 'published', ...base } })
    await prisma.demand.create({ data: { id: 'D9102', title: '多值筛选-已驳回', status: 'rejected', ...base } })

    const multi = await request(app.getHttpServer())
      .get('/api/admin/demands?status=published&status=rejected&page=1&pageSize=50')
      .set('Authorization', `Bearer ${token}`)
    expect(multi.status).toBe(200)
    const ids = multi.body.data.list.map((d: { id: string }) => d.id)
    expect(ids).toContain('D9101')
    expect(ids).toContain('D9102')

    /* 单值仍兼容：只查已发布不带出已驳回 */
    const single = await request(app.getHttpServer())
      .get('/api/admin/demands?status=published&page=1&pageSize=50')
      .set('Authorization', `Bearer ${token}`)
    expect(single.status).toBe(200)
    expect(single.body.data.list.some((d: { id: string }) => d.id === 'D9102')).toBe(false)

    /* 前端「全不选」会落成 ?status=：归一后视为未过滤，已驳回可见 */
    const cleared = await request(app.getHttpServer())
      .get('/api/admin/demands?status=&page=1&pageSize=50')
      .set('Authorization', `Bearer ${token}`)
    expect(cleared.status).toBe(200)
    expect(cleared.body.data.list.some((d: { id: string }) => d.id === 'D9102')).toBe(true)

    /* 非法状态值 → 400 */
    const bad = await request(app.getHttpServer())
      .get('/api/admin/demands?status=not-a-status&page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)
    expect(bad.status).toBe(400)
  })
})
