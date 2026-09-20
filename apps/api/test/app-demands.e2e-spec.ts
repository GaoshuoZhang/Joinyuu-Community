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

    /* 详情返回本人响应快照（内容 + 状态），客户端据此隐藏响应入口并展示响应说明 */
    const detail = await appGet(app, tokenB, `/api/app/demands/${id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.myResponse).toMatchObject({ message: '我可以承接，做过类似项目', status: 'pending' })

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
      const select = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/select`, { responseIds: [newRow.id] })
      expect(select.status).toBe(200)
      const blocked = await appPost(app, tokenB, `/api/app/me/responses/${newRow.id}/withdraw`, {})
      expect(blocked.status).toBe(409)
      expect(blocked.body.message).toContain('立项')
    }
  })

  it('发布需求（pending→管理端置 published）→ 应者响应 → 发布者选定承接方 → 管理员立项 → 里程碑验收结项', async () => {
    const adminToken = await loginAs(app)

    // ①发布者新建需求（kind=task），status=pending
    const created = await appPost(app, tokenA, '/api/app/demands', {
      title: 'R2 撮合测试需求-前端改版',
      description: '需要完成一次移动端界面改版',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'community_individual',
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
})
