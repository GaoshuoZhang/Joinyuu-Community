/* M2-R R2 验收：需求撮合闭环（浏览/响应/撤回/发布者筛选 → accept 立项生成协作项目 → 里程碑提交/验收/结项）
 * 前置：docker compose up + prisma migrate + seed；密码 user123 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost } from './helpers/app-login'

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

  it('响应 seed 已发布需求 → 防重复 409 → 我可撤回与重响应', async () => {
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

    const mine = await appGet(app, tokenB, '/api/app/me/responses')
    expect(mine.status).toBe(200)
    const mineRows = Array.isArray(mine.body.data) ? mine.body.data : mine.body.data.list
    const row = mineRows.find((r: { demandId: string }) => r.demandId === id)
    expect(row).toBeTruthy()
    const responseId: number = row.id

    const withdraw = await appPost(app, tokenB, `/api/app/me/responses/${responseId}/withdraw`, {})
    expect(withdraw.status).toBe(200)

    const again = await appPost(app, tokenB, `/api/app/demands/${id}/respond`, { note: '撤回后重响应' })
    expect(again.status).toBe(200)
  })

  it('发布需求（pending→管理端置 published）→ 应者响应 → 发布者 accept → 立项 → 里程碑验收结项', async () => {
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

    // ③响应者响应
    const resp = await appPost(app, tokenB, `/api/app/demands/${demandId}/respond`, {
      note: '可承接本次改版',
      quote: '1.5 万',
    })
    expect(resp.status).toBe(200)

    // ④发布者查看响应列表
    const list = await appGet(app, tokenA, `/api/app/me/demands/${demandId}/responses`)
    expect(list.status).toBe(200)
    expect(list.body.data.length).toBe(1)
    const responseId: number = list.body.data[0].id

    // ⑤非发布者查看响应列表 → 403
    const forbidden = await appGet(app, tokenB, `/api/app/me/demands/${demandId}/responses`)
    expect(forbidden.status).toBe(403)

    // ⑥发布者 accept → 立项生成项目
    const accept = await appPost(app, tokenA, `/api/app/me/demands/${demandId}/responses/${responseId}/review`, {
      action: 'accept',
    })
    expect(accept.status).toBe(200)
    const projectId: string = accept.body.data.projectId
    expect(projectId).toBeTruthy()

    // ⑦需求转 projected、双方项目可见
    const demand = await prisma.demand.findUnique({ where: { id: demandId } })
    expect(demand?.status).toBe('projected')
    const projListA = await appGet(app, tokenA, '/api/app/me/projects')
    const projRowsA = Array.isArray(projListA.body.data) ? projListA.body.data : projListA.body.data.list
    expect(projRowsA.some((p: { id: string }) => p.id === projectId)).toBe(true)
    const projListB = await appGet(app, tokenB, '/api/app/me/projects')
    const projRowsB = Array.isArray(projListB.body.data) ? projListB.body.data : projListB.body.data.list
    expect(projRowsB.some((p: { id: string }) => p.id === projectId)).toBe(true)

    // ⑧发起方不能 submit 里程碑（承接方才能）
    const detail = await appGet(app, tokenA, `/api/app/me/projects/${projectId}`)
    const milestone = detail.body.data.milestones.find((m: { status: string }) => m.status === 'todo')
    const msId: number = milestone.id
    const subByPublisher = await appPost(app, tokenA, `/api/app/me/projects/${projectId}/milestones/${msId}/submit`, {
      note: '测试',
    })
    expect(subByPublisher.status).toBe(403)

    // ⑨承接方 submit → 发布者 accept → 全部验收 → 自动结项
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
  })

  it('需求沟通留言板仅参与方可见', async () => {
    const list = await appGet(app, tokenA, '/api/app/demands?pageSize=1')
    const id: string = list.body.data.list[0].id
    const outsider = await appLoginAs(app, '13801210002', 'user123')
    const forbidden = await appGet(app, outsider, `/api/app/demands/${id}/messages`)
    expect(forbidden.status).toBe(403)
  })
})