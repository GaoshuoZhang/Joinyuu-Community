/* M2-R R2 验收：需求撮合闭环（浏览/响应/撤回/发布者选定承接方 → selected → 管理员立项生成协作项目
 * → 里程碑提交/验收/结项）。前置：docker compose up + prisma migrate + seed；密码 user123 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost } from './helpers/app-login'
import { loginAs } from './helpers/login'

describe('M2-R R2 app 需求撮合', () => {
  let app: INestApplication
  let prisma: PrismaService
  let tokenA: string // 发布者 U1001 陈屿
  let tokenB: string // 响应者 U1005 顾北辰

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    tokenA = await appLoginAs(app, '13801210001', 'user123')
    tokenB = await appLoginAs(app, '13801210005', 'user123')
  })

  afterAll(async () => {
    await app.close()
  })

  it('需求列表返回 published 且含 kind', async () => {
    const res = await appGet(app, tokenA, '/api/app/demands?page=1&pageSize=5')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.list)).toBe(true)
    expect(res.body.data.list.length).toBeGreaterThan(0)
    expect(['task', 'investment', 'cooperation']).toContain(res.body.data.list[0].kind ?? res.body.data.list[0].demandType)
  })

  it('详情：published 需求登录可见联系人', async () => {
    const list = await appGet(app, tokenA, '/api/app/demands?pageSize=1')
    const id: string = list.body.data.list[0].id
    const res = await appGet(app, tokenA, `/api/app/demands/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(id)
  })

  it('响应 seed 已发布需求 → 防重复 409 → 我的响应可见', async () => {
    const list = await appGet(app, tokenB, '/api/app/demands?pageSize=20')
    const target = list.body.data.list.find((d: { id: string }) => d.id !== 'D4')
    const id: string = target.id

    const first = await appPost(app, tokenB, `/api/app/demands/${id}/respond`, {
      note: '我可以承接，做过类似项目',
      quote: '按预算执行',
    })
    expect(first.status).toBe(200)
    expect(first.body.code).toBe(0)

    const dup = await appPost(app, tokenB, `/api/app/demands/${id}/respond`, { note: '再来一次' })
    expect(dup.status).toBe(409)

    /* 详情返回本人响应快照（内容 + 状态）；提交需审核 → 待审核（pending_review），
     * 客户端据此隐藏响应入口并展示响应说明 */
    const detail = await appGet(app, tokenB, `/api/app/demands/${id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.myResponse).toMatchObject({ message: '我可以承接，做过类似项目', status: 'pending_review' })

    const mine = await appGet(app, tokenB, '/api/app/me/responses')
    expect(mine.status).toBe(200)
    const mineRows = Array.isArray(mine.body.data) ? mine.body.data : mine.body.data.list
    const row = mineRows.find((r: { demandId: string }) => r.demandId === id)
    expect(row).toBeTruthy()
  })

  it('撤回响应（D-107）：待处理可撤回 → 可重新响应 → 已选定后不可撤回', async () => {
    /* 选一条 U1005 尚未响应且非本人发布的已发布需求（列表 DTO 不含 myResponse，需排除已响应集合） */
    const responded = await appGet(app, tokenB, '/api/app/me/responses')
    const respondedRows = Array.isArray(responded.body.data) ? responded.body.data : responded.body.data.list
    const respondedIds = new Set(respondedRows.map((r: { demandId: string }) => r.demandId))
    const list = await appGet(app, tokenB, '/api/app/demands?pageSize=50')
    const target = list.body.data.list.find(
      (d: { id: string; publisherId?: string }) => d.publisherId !== 'U1005' && !respondedIds.has(d.id),
    )
    expect(target).toBeTruthy()
    const demandId: string = target.id

    const respond = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, { note: '撤回测试响应' })
    expect(respond.status).toBe(200)
    const mineBefore = await appGet(app, tokenB, '/api/app/me/responses')
    const rowsBefore = Array.isArray(mineBefore.body.data) ? mineBefore.body.data : mineBefore.body.data.list
    const rowBefore = rowsBefore.find((r: { demandId: string }) => r.demandId === demandId)
    expect(rowBefore.withdrawnAt).toBeUndefined()

    /* 撤回 → 视为未响应（可重新响应） */
    const withdraw = await appPost(app, tokenB, `/api/app/me/responses/${rowBefore.id}/withdraw`, {})
    expect(withdraw.status).toBe(200)
    const detailAfterWithdraw = await appGet(app, tokenB, `/api/app/demands/${demandId}`)
    expect(detailAfterWithdraw.body.data.myResponse).toBeUndefined()
    const mineAfter = await appGet(app, tokenB, '/api/app/me/responses')
    const rowsAfter = Array.isArray(mineAfter.body.data) ? mineAfter.body.data : mineAfter.body.data.list
    const rowAfter = rowsAfter.find((r: { demandId: string }) => r.demandId === demandId)
    expect(rowAfter.withdrawnAt).toBeTruthy()

    /* 重复撤回 → 404 */
    const again = await appPost(app, tokenB, `/api/app/me/responses/${rowBefore.id}/withdraw`, {})
    expect(again.status).toBe(404)

    /* 重新响应 → 发布者（测试账号 U1001）选定后不可再撤回（409） */
    const reRespond = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, { note: '重新响应' })
    expect(reRespond.status).toBe(200)
    const mineAgain = await appGet(app, tokenB, '/api/app/me/responses')
    const rowsAgain = Array.isArray(mineAgain.body.data) ? mineAgain.body.data : mineAgain.body.data.list
    const newRow = rowsAgain.find((r: { demandId: string; withdrawnAt?: string }) => r.demandId === demandId && !r.withdrawnAt)
    if (target.publisherId === 'U1001') {
      /* 重新响应后同样落待审核（pending_review），发布者选定前需管理员先审核通过 */
      const adminToken = await loginAs(app)
      const reviewed = await request(app.getHttpServer())
        .post(`/api/admin/demands/${demandId}/respondents/${newRow.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' })
      expect(reviewed.status).toBe(200)
      const select = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/select`, { responseIds: [newRow.id] })
      expect(select.status).toBe(200)
      const blocked = await appPost(app, tokenB, `/api/app/me/responses/${newRow.id}/withdraw`, {})
      expect(blocked.status).toBe(409)
      expect(blocked.body.message).toContain('立项')
    }
  })

  it('发布需求（pending→管理端置 published）→ 应者响应 → 发布者选定承接方 → 管理员立项 → 里程碑验收结项', async () => {
    const adminToken = await loginAs(app)

    /* ①发布者新建需求（kind=task），status=pending；
     * 种子 U1001 仅持有 individual/社区企业/合作企业身份（无 community_individual），故按其个人身份发布 */
    const created = await appPost(app, tokenA, '/api/app/demands', {
      title: 'R2 撮合测试需求-前端改版',
      description: '需要完成一次移动端界面改版',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'individual',
      deliverable: '交付新版 UI 原型与说明文档',
      deliverBy: '2026-10-30',
      budget: '2 万以内',
      period: '两周',
      contactName: '陈屿',
      contactPhone: '13801210001',
    })
    expect(created.status).toBe(200)
    const demandId: string = created.body.data.id
    expect(demandId).toBeTruthy()

    // ②模拟管理端审核通过 → published
    await prisma.demand.update({ where: { id: demandId }, data: { status: 'published' } })

    // 字典类别在库中保存 code，但 App 展示契约必须返回标签。
    const plazaWithCreated = await appGet(app, tokenA, '/api/app/demands?pageSize=50')
    expect(plazaWithCreated.body.data.list.find((d: { id: string }) => d.id === demandId)?.categoryLabel).toBe('技术开发')

    // ③响应者响应
    const resp = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, {
      note: '可承接本次改版',
      quote: '1.5 万',
    })
    expect(resp.status).toBe(200)

    // ③′默认需审核：管理员审核通过后，响应才回到「待处理」并对发布者可见
    const respondent = await prisma.demandRespondent.findFirst({ where: { demandId } })
    expect(respondent).toBeTruthy()
    const approvedRes = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/respondents/${respondent!.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
    expect(approvedRes.status).toBe(200)

    // ④发布者查看响应列表；非发布者 403
    const list = await appGet(app, tokenA, `/api/app/me/demands/${demandId}/responses`)
    expect(list.status).toBe(200)
    expect(list.body.data.length).toBe(1)
    const responseId: number = list.body.data[0].id
    const forbidden = await appGet(app, tokenB, `/api/app/me/demands/${demandId}/responses`)
    expect(forbidden.status).toBe(403)

    // ⑤非发布者不可选定承接方；空选择 400
    const notOwner = await appPost(app, tokenB, `/api/app/me/demands/${demandId}/select`, { responseIds: [responseId] })
    expect(notOwner.status).toBe(403)
    const empty = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/select`, { responseIds: [] })
    expect(empty.status).toBe(400)

    // ⑥发布者多选意向承接方并提交立项 → selected（不生成项目，等待管理员确认）
    const selected = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/select`, { responseIds: [responseId] })
    expect(selected.status).toBe(200)
    const afterSelect = await prisma.demand.findUnique({ where: { id: demandId } })
    expect(afterSelect?.status).toBe('selected')
    expect(afterSelect?.projectId).toBeNull()
    expect(afterSelect?.matchedRespondent).toContain('顾北辰')
    const acceptedRow = await prisma.demandRespondent.findFirst({ where: { id: responseId } })
    expect(acceptedRow?.status).toBe('accepted')
    const selectedMine = await appGet(app, tokenB, '/api/app/me/responses')
    const selectedMineRows = Array.isArray(selectedMine.body.data) ? selectedMine.body.data : selectedMine.body.data.list
    expect(selectedMineRows.find((row: { id: number }) => row.id === responseId)?.status).toBe('accepted')

    // ⑦已选定后：发布者和已有响应者可查看详情；无关用户不可见；不再接受新响应
    const ownDetail = await appGet(app, tokenA, `/api/app/demands/${demandId}`)
    expect(ownDetail.status).toBe(200)
    expect(ownDetail.body.data.status).toBe('selected')
    const respondentDetail = await appGet(app, tokenB, `/api/app/demands/${demandId}`)
    expect(respondentDetail.status).toBe(200)
    expect(respondentDetail.body.data.myResponse).toMatchObject({ status: 'accepted' })
    const outsiderToken = await appLoginAs(app, '13801210009', 'user123')
    const outsiderDetail = await appGet(app, outsiderToken, `/api/app/demands/${demandId}`)
    expect(outsiderDetail.status).toBe(404)
    const plaza = await appGet(app, tokenB, '/api/app/demands?pageSize=50')
    expect(plaza.body.data.list.some((d: { id: string }) => d.id === demandId)).toBe(false)
    const againRespond = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, { note: '再响应一次' })
    expect(againRespond.status).toBe(409)

    // ⑧管理员手动立项 → projected + 双向关联 + 承接方积分/经验补发
    const initiated = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/initiate-project`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectName: 'R2 撮合测试需求-前端改版专项',
        undertakers: [{ type: 'individual', id: 'U1005', share: 100 }],
        description: '承接移动端界面改版',
        milestones: [
          { name: '合作方案确认', date: '2026-10-01', owners: [] },
          { name: '项目交付', date: '2026-10-30', owners: [] },
        ],
        expReward: 100,
      })
    expect(initiated.status).toBe(200)
    const projectId: string = initiated.body.data.id
    expect(projectId).toBeTruthy()
    const demand = await prisma.demand.findUnique({ where: { id: demandId } })
    expect(demand?.status).toBe('projected')
    expect(demand?.projectId).toBe(projectId)
    const rewarded = await prisma.pointsRecord.findFirst({
      where: { userId: 'U1005', dedupeKey: `demand_undertaken:U1005:${demandId}` },
    })
    expect(rewarded?.delta).toBe(200)
    const expGained = await prisma.experienceRecord.findFirst({
      where: { targetType: 'individual', targetId: 'U1005', reason: '承接需求立项获得项目经验' },
    })
    expect(expGained?.delta).toBe(30)

    /* ⑧′响应收敛（item 4）：入选响应 → undertaken，不再停在「已选定」；
     * 「我的响应」下发新状态与项目 ID（客户端据此显示「已承接」并跳转协作项目） */
    const undertakenRow = await prisma.demandRespondent.findFirst({ where: { id: responseId } })
    expect(undertakenRow?.status).toBe('undertaken')
    const mineAfterInit = await appGet(app, tokenB, '/api/app/me/responses')
    const mineRowsAfterInit = Array.isArray(mineAfterInit.body.data) ? mineAfterInit.body.data : mineAfterInit.body.data.list
    const mineUnder = mineRowsAfterInit.find((r: { id: number }) => r.id === responseId)
    expect(mineUnder?.status).toBe('undertaken')
    expect(mineUnder?.projectId).toBe(projectId)
    /* 发布者视角响应列表同步透传新状态（此前仅透传 pending/accepted/rejected，会回落「待选定」） */
    const ownerList = await appGet(app, tokenA, `/api/app/me/demands/${demandId}/responses`)
    expect(ownerList.body.data.find((r: { id: number }) => r.id === responseId)?.status).toBe('undertaken')

    // ⑨双方项目可见
    const projListA = await appGet(app, tokenA, '/api/app/me/projects')
    const projRowsA = Array.isArray(projListA.body.data) ? projListA.body.data : projListA.body.data.list
    expect(projRowsA.some((p: { id: string }) => p.id === projectId)).toBe(true)
    const projListB = await appGet(app, tokenB, '/api/app/me/projects')
    const projRowsB = Array.isArray(projListB.body.data) ? projListB.body.data : projListB.body.data.list
    expect(projRowsB.some((p: { id: string }) => p.id === projectId)).toBe(true)

    // ⑩发起方不能 submit 里程碑（承接方才能）
    const detail = await appGet(app, tokenA, `/api/app/me/projects/${projectId}`)
    const milestone = detail.body.data.milestones.find((m: { status: string }) => m.status === 'todo')
    const msId: number = milestone.id
    const subByPublisher = await appPost(app, tokenA, `/api/app/me/projects/${projectId}/milestones/${msId}/submit`, {
      note: '测试',
    })
    expect(subByPublisher.status).toBe(403)

    // ⑪承接方 submit → 发布者 accept → 全部验收 → 自动结项
    for (const m of detail.body.data.milestones) {
      const sub = await appPost(app, tokenB, `/api/app/me/projects/${projectId}/milestones/${m.id}/submit`, {
        note: '交付完成',
      })
      expect(sub.status).toBe(200)
      const acc = await appPost(app, tokenA, `/api/app/me/projects/${projectId}/milestones/${m.id}/accept`, {})
      expect(acc.status).toBe(200)
    }
    const after = await prisma.project.findUnique({ where: { id: projectId } })
    expect(after?.status).toBe('finished')
    expect(after?.finishedAt).toBeTruthy()

    /* D-108/D-109：详情回填对端名称、来源需求 ID 与结项时间 */
    const detailInitiator = await appGet(app, tokenA, `/api/app/me/projects/${projectId}`)
    expect(detailInitiator.body.data.role).toBe('需求发起方')
    expect(detailInitiator.body.data.partnerName).toBeTruthy()
    expect(detailInitiator.body.data.sourceDemandId).toBe(demandId)
    expect(detailInitiator.body.data.finishedAt).toBe(after?.finishedAt)

    const detailUndertaker = await appGet(app, tokenB, `/api/app/me/projects/${projectId}`)
    expect(detailUndertaker.body.data.partnerName).toBe('陈屿')
    expect(detailUndertaker.body.data.finishedAt).toBe(after?.finishedAt)

    const listInitiator = await appGet(app, tokenA, '/api/app/me/projects')
    const row = listInitiator.body.data.find((p: { id: string }) => p.id === projectId)
    expect(row.finishedAt).toBe(after?.finishedAt)
  })

  it('响应需审核闭环：待审核不可见 → 审核通过后可见/发积分/通知 → 发布者选定', async () => {
    const adminToken = await loginAs(app)
    const title = 'R2 响应审核闭环需求-产品图片精修'

    /* 发布者 U1001 建单（默认需审核），后台置 published */
    const created = await appPost(app, tokenA, '/api/app/demands', {
      title,
      description: '需要完成一次产品图片精修',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'individual',
      deliverable: '交付精修后图片与说明',
      deliverBy: '2026-11-30',
      budget: '面议',
      period: '两周',
      contactName: '陈屿',
      contactPhone: '13801210001',
    })
    expect(created.status).toBe(200)
    const demandId: string = created.body.data.id
    await prisma.demand.update({ where: { id: demandId }, data: { status: 'published' } })

    /* 响应者提交（含报价/工期/案例/联系手机）→ 落待审核 */
    const respond = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, {
      note: '可承接精修',
      quote: '1.5 万',
      timeline: '2 周内可开工',
      cases: '曾完成 3 个同类改版项目',
      phone: '13801210005',
    })
    expect(respond.status).toBe(200)
    const detail = await appGet(app, tokenB, `/api/app/demands/${demandId}`)
    expect(detail.body.data.myResponse).toMatchObject({ status: 'pending_review' })

    /* 补充信息落库 */
    const profileRow = await prisma.demandRespondent.findFirst({ where: { demandId } })
    expect(profileRow).toMatchObject({
      quote: '1.5 万',
      timeline: '2 周内可开工',
      cases: '曾完成 3 个同类改版项目',
      phone: '13801210005',
    })

    /* 响应者「我的响应」下发补充信息 */
    const mineResp = await appGet(app, tokenB, '/api/app/me/responses')
    const mineRows = Array.isArray(mineResp.body.data) ? mineResp.body.data : mineResp.body.data.list
    expect(mineRows.find((r: { demandId: string }) => r.demandId === demandId)).toMatchObject({
      quote: '1.5 万',
      timeline: '2 周内可开工',
      cases: '曾完成 3 个同类改版项目',
      phone: '13801210005',
    })

    /* 未过审：不发响应积分 */
    const beforePoints = await prisma.pointsRecord.findFirst({
      where: { dedupeKey: { startsWith: `demand_responded:U1005:${demandId}:` } },
    })
    expect(beforePoints).toBeNull()

    /* 未过审：发布者响应列表不可见；计数不含待审核 */
    const hidden = await appGet(app, tokenA, `/api/app/me/demands/${demandId}/responses`)
    expect(hidden.status).toBe(200)
    expect(hidden.body.data).toEqual([])
    const publisherDetail = await appGet(app, tokenA, `/api/app/demands/${demandId}`)
    expect(publisherDetail.body.data.responseCount).toBe(0)
    const plaza = await appGet(app, tokenA, '/api/app/demands?pageSize=50')
    expect(plaza.body.data.list.find((d: { id: string }) => d.id === demandId)?.responseCount).toBe(0)

    /* 管理员审核通过：响应回到待处理，发响应积分并通知发布者 */
    const respondent = await prisma.demandRespondent.findFirst({ where: { demandId } })
    expect(respondent).toBeTruthy()
    const respondentId = respondent!.id
    const approved = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/respondents/${respondentId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
    expect(approved.status).toBe(200)
    expect(approved.body.code).toBe(0)

    const visible = await appGet(app, tokenA, `/api/app/me/demands/${demandId}/responses`)
    expect(visible.body.data.length).toBe(1)
    expect(visible.body.data[0].status).toBe('pending')
    /* 过审后发布者视角可见报价/工期/案例/联系手机 */
    expect(visible.body.data[0]).toMatchObject({
      quote: '1.5 万',
      timeline: '2 周内可开工',
      cases: '曾完成 3 个同类改版项目',
      phone: '13801210005',
    })
    const rewarded = await prisma.pointsRecord.findFirst({
      where: { userId: 'U1005', dedupeKey: `demand_responded:U1005:${demandId}:${respondentId}` },
    })
    expect(rewarded?.delta).toBeGreaterThan(0)
    const notice = await prisma.userNotification.findFirst({
      where: { userId: 'U1001', title: '收到新的需求响应', content: { contains: title } },
    })
    expect(notice).toBeTruthy()

    /* 过审后发布者可选定 */
    const select = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/select`, { responseIds: [respondentId] })
    expect(select.status).toBe(200)
    const accepted = await prisma.demandRespondent.findUnique({ where: { id: respondentId } })
    expect(accepted?.status).toBe('accepted')
  })

  it('响应驳回：理由必填 → 驳回后失效可重新响应 → 重复审核 409', async () => {
    const adminToken = await loginAs(app)

    const created = await appPost(app, tokenA, '/api/app/demands', {
      title: 'R2 响应驳回需求-样品拍摄',
      description: '需要完成一次产品样品拍摄',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'individual',
      deliverable: '交付拍摄成片与说明',
      deliverBy: '2026-11-30',
      budget: '面议',
      period: '一周',
      contactName: '陈屿',
      contactPhone: '13801210001',
    })
    expect(created.status).toBe(200)
    const demandId: string = created.body.data.id
    await prisma.demand.update({ where: { id: demandId }, data: { status: 'published' } })

    const respond = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, { note: '可承接拍摄' })
    expect(respond.status).toBe(200)
    const respondent = await prisma.demandRespondent.findFirst({ where: { demandId, withdrawnAt: null } })
    expect(respondent).toBeTruthy()
    const respondentId = respondent!.id

    /* 驳回缺 reason → 400 */
    const missingReason = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/respondents/${respondentId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected' })
    expect(missingReason.status).toBe(400)

    /* 带 reason 驳回 → 200 */
    const reason = '资料不完整，请补充作品集'
    const rejected = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/respondents/${respondentId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', reason })
    expect(rejected.status).toBe(200)
    expect(rejected.body.code).toBe(0)

    /* 我的响应：记驳回理由，并置失效（withdrawnAt） */
    const mine = await appGet(app, tokenB, '/api/app/me/responses')
    const rows = Array.isArray(mine.body.data) ? mine.body.data : mine.body.data.list
    const row = rows.find((r: { id: number }) => r.id === respondentId)
    expect(row).toMatchObject({ status: 'rejected', rejectReason: reason })
    expect(row.withdrawnAt).toBeTruthy()

    /* 重复审核同一响应 → 409 */
    const again = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/respondents/${respondentId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
    expect(again.status).toBe(409)

    /* 驳回已置失效 → 允许重新响应同一需求 */
    const reRespond = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, { note: '补齐作品集后重新响应' })
    expect(reRespond.status).toBe(200)
    const newRow = await prisma.demandRespondent.findFirst({ where: { demandId, withdrawnAt: null } })
    expect(newRow).toBeTruthy()
    expect(newRow!.id).not.toBe(respondentId)
    expect(newRow!.status).toBe('pending_review')
  })

  it('响应入参边界：手机号格式非法 400 / 响应说明超 500 字 400', async () => {
    /* 发布者 U1001 建单并置 published，作为边界校验的目标需求 */
    const created = await appPost(app, tokenA, '/api/app/demands', {
      title: 'R2 响应入参边界需求-文案润色',
      description: '需要完成一次文案润色',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'individual',
      deliverable: '交付润色后文案',
      deliverBy: '2026-11-30',
      budget: '面议',
      period: '一周',
      contactName: '陈屿',
      contactPhone: '13801210001',
    })
    expect(created.status).toBe(200)
    const demandId: string = created.body.data.id
    await prisma.demand.update({ where: { id: demandId }, data: { status: 'published' } })

    /* phone 不符合 /^1\d{10}$/ → 400 */
    const badPhone = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, {
      note: '可承接润色',
      phone: '123',
    })
    expect(badPhone.status).toBe(400)

    /* note 超 500 字 → 400 */
    const tooLongNote = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, {
      note: '需'.repeat(501),
    })
    expect(tooLongNote.status).toBe(400)

    /* 两次非法提交均未落库 */
    const persisted = await prisma.demandRespondent.findFirst({ where: { demandId } })
    expect(persisted).toBeNull()
  })

  it('多承接方结项：里程碑积分与结项经验覆盖全部承接方（经验按承接占比分配）', async () => {
    const adminToken = await loginAs(app)
    const tokenC = await appLoginAs(app, '13801210006', 'user123') // U1006 沈嘉禾（持社区个体身份）

    /* ① 发布者 U1001 建单并置 published */
    const created = await appPost(app, tokenA, '/api/app/demands', {
      title: 'R2 多承接方结项经验测试',
      description: '验证多承接方结项经验按占比分配、里程碑积分覆盖全部承接方',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'individual',
      deliverable: '交付说明文档',
      deliverBy: '2026-11-30',
      budget: '面议',
      period: '一个月',
      contactName: '陈屿',
      contactPhone: '13801210001',
    })
    expect(created.status).toBe(200)
    const demandId: string = created.body.data.id
    await prisma.demand.update({ where: { id: demandId }, data: { status: 'published' } })

    /* ② 两位承接方响应并通过审核（U1005/U1006，不同主体、均持社区个体身份） */
    for (const t of [tokenB, tokenC]) {
      const r = await appPost(app, t, `/api/app/demands/${demandId}/respond`, { note: '可承接' })
      expect(r.status).toBe(200)
    }
    const rows = await prisma.demandRespondent.findMany({ where: { demandId }, orderBy: { id: 'asc' } })
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const reviewed = await request(app.getHttpServer())
        .post(`/api/admin/demands/${demandId}/respondents/${row.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' })
      expect(reviewed.status).toBe(200)
    }

    /* ③ 发布者多选两位承接方 → 管理员立项（expReward=100，占比 50/50） */
    const selected = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/select`, {
      responseIds: rows.map((r) => r.id),
    })
    expect(selected.status).toBe(200)
    const initiated = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/initiate-project`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectName: 'R2 多承接方结项经验测试专项',
        undertakers: [
          { type: 'individual', id: 'U1005', share: 50 },
          { type: 'individual', id: 'U1006', share: 50 },
        ],
        description: '多承接方分配验证',
        milestones: [{ name: '交付验收', date: '2026-11-30', owners: [] }],
        expReward: 100,
      })
    expect(initiated.status).toBe(200)
    const projectId: string = initiated.body.data.id

    /* ④ 里程碑提交+验收 → 结项 */
    const detail = await appGet(app, tokenB, `/api/app/me/projects/${projectId}`)
    const msId: number = detail.body.data.milestones[0].id
    const sub = await appPost(app, tokenB, `/api/app/me/projects/${projectId}/milestones/${msId}/submit`, { note: '完成' })
    expect(sub.status).toBe(200)
    const acc = await appPost(app, tokenA, `/api/app/me/projects/${projectId}/milestones/${msId}/accept`, {})
    expect(acc.status).toBe(200)
    const finished = await prisma.project.findUnique({ where: { id: projectId } })
    expect(finished?.status).toBe('finished')

    /* ⑤ 回归：两位承接方都应获得里程碑积分与结项经验（总额 100 按 50/50 分配，各 50） */
    for (const uid of ['U1005', 'U1006']) {
      const milestonePoints = await prisma.pointsRecord.findFirst({
        where: { userId: uid, dedupeKey: `project_milestone:${msId}:${uid}` },
      })
      expect(milestonePoints).toBeTruthy()
      const finishExp = await prisma.experienceRecord.findFirst({
        where: {
          targetType: 'individual',
          targetId: uid,
          reason: '「R2 多承接方结项经验测试专项」结项经验值',
        },
      })
      expect(finishExp?.delta).toBe(50)
    }
  })

  it('选定后可纠正：重新选定覆盖上一次，撤销选定回到已发布', async () => {
    const adminToken = await loginAs(app)
    const tokenC = await appLoginAs(app, '13801210006', 'user123') // U1006 沈嘉禾

    /* ① 发布者 U1001 建单并置 published */
    const created = await appPost(app, tokenA, '/api/app/demands', {
      title: 'R2 选定纠正路径测试',
      description: '验证重新选定与撤销选定',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'individual',
      deliverable: '交付说明',
      deliverBy: '2026-12-31',
      budget: '面议',
      period: '两周',
      contactName: '陈屿',
      contactPhone: '13801210001',
    })
    expect(created.status).toBe(200)
    const demandId: string = created.body.data.id
    await prisma.demand.update({ where: { id: demandId }, data: { status: 'published' } })

    /* ② 两位响应者响应并通过审核 */
    for (const t of [tokenB, tokenC]) {
      const r = await appPost(app, t, `/api/app/demands/${demandId}/respond`, { note: '可承接' })
      expect(r.status).toBe(200)
    }
    const rows = await prisma.demandRespondent.findMany({ where: { demandId }, orderBy: { id: 'asc' } })
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const reviewed = await request(app.getHttpServer())
        .post(`/api/admin/demands/${demandId}/respondents/${row.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' })
      expect(reviewed.status).toBe(200)
    }

    /* ③ 首次选定第 1 位 → selected */
    const first = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/select`, { responseIds: [rows[0].id] })
    expect(first.status).toBe(200)
    expect((await prisma.demand.findUnique({ where: { id: demandId } }))?.status).toBe('selected')

    /* ④ 重新选定第 2 位：覆盖上一次，原「已选定」回退「待选定」 */
    const reselect = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/select`, { responseIds: [rows[1].id] })
    expect(reselect.status).toBe(200)
    expect((await prisma.demandRespondent.findUnique({ where: { id: rows[0].id } }))?.status).toBe('pending')
    expect((await prisma.demandRespondent.findUnique({ where: { id: rows[1].id } }))?.status).toBe('accepted')
    expect((await prisma.demand.findUnique({ where: { id: demandId } }))?.status).toBe('selected')

    /* ⑤ 撤销选定：回到 published，已选定响应回退待选定 */
    const deselect = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/deselect`, {})
    expect(deselect.status).toBe(200)
    expect((await prisma.demand.findUnique({ where: { id: demandId } }))?.status).toBe('published')
    expect((await prisma.demandRespondent.findUnique({ where: { id: rows[1].id } }))?.status).toBe('pending')

    /* ⑥ 非发布者不可撤销（403）；已发布态不可撤销（409） */
    const byOther = await appPost(app, tokenB, `/api/app/me/demands/${demandId}/deselect`, {})
    expect(byOther.status).toBe(403)
    const again = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/deselect`, {})
    expect(again.status).toBe(409)
  })

  it('响应字段级可见性：联系邮箱随响应提交并下发给发布者；审核勾选隐藏的字段不下发（后台保留真实值）', async () => {
    const adminToken = await loginAs(app)

    /* ① 发布者 U1001 建单并置 published */
    const created = await appPost(app, tokenA, '/api/app/demands', {
      title: 'R2 响应字段可见性需求-包装设计',
      description: '需要完成一次产品包装设计',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'individual',
      deliverable: '交付包装设计稿',
      deliverBy: '2026-11-30',
      budget: '面议',
      period: '两周',
      contactName: '陈屿',
      contactPhone: '13801210001',
    })
    expect(created.status).toBe(200)
    const demandId: string = created.body.data.id
    await prisma.demand.update({ where: { id: demandId }, data: { status: 'published' } })

    /* ② 响应者提交（含联系邮箱）→ 邮箱落库（此前该字段恒为 null，发布者看不到联系方式） */
    const respond = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, {
      note: '可承接包装设计',
      quote: '2 万',
      timeline: '3 周内可开工',
      cases: '完成过 5 个包装项目',
      phone: '13801210005',
      email: 'gubeichen@example.com',
    })
    expect(respond.status).toBe(200)
    const row = await prisma.demandRespondent.findFirst({ where: { demandId } })
    expect(row).toBeTruthy()
    expect(row?.email).toBe('gubeichen@example.com')

    /* ③ 审核通过且勾选隐藏联系手机/联系邮箱：发布者侧不下发这两项，其余字段仍可见 */
    const approved = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/respondents/${row!.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', hiddenFields: ['phone', 'email'] })
    expect(approved.status).toBe(200)

    const publisherView = await appGet(app, tokenA, `/api/app/me/demands/${demandId}/responses`)
    expect(publisherView.status).toBe(200)
    const visibleRow = publisherView.body.data[0]
    expect(visibleRow.note).toBe('可承接包装设计')
    expect(visibleRow.quote).toBe('2 万')
    expect(visibleRow.timeline).toBe('3 周内可开工')
    expect(visibleRow.cases).toBe('完成过 5 个包装项目')
    /* 被隐藏字段整体不下发（键不存在，而不是空串） */
    expect('phone' in visibleRow).toBe(false)
    expect('email' in visibleRow).toBe(false)

    /* ④ 后台与响应者本人仍可见真实值（隐藏只作用于发布者侧） */
    const adminDetail = await request(app.getHttpServer())
      .get(`/api/admin/demands/${demandId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    const adminRow = (adminDetail.body.data.respondents as Array<{ id: number; phone?: string; email?: string; hiddenFields?: string[] }>)
      .find((item) => item.id === row!.id)
    expect(adminRow?.phone).toBe('13801210005')
    expect(adminRow?.email).toBe('gubeichen@example.com')
    expect(adminRow?.hiddenFields).toEqual(['phone', 'email'])

    const mine = await appGet(app, tokenB, '/api/app/me/responses')
    const mineRows = Array.isArray(mine.body.data) ? mine.body.data : mine.body.data.list
    const mineRow = mineRows.find((item: { id: number }) => item.id === row!.id)
    expect(mineRow?.phone).toBe('13801210005')
  })
})
