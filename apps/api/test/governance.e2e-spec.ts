/* M2-R R3 复查补验：信任治理闭环（admin 侧处置 / 复核 / 退驻审核 / 协议版本留痕）
 * 前置：docker compose up（PG/Redis/MinIO healthy）+ reseed；app 用户密码 user123；admin 超管 admin/admin123
 * 覆盖用户复查改动：governance 举报处置→目标状态回写、申诉模型复核、退驻审核→exited、注册协议版本实际留痕 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost, fetchAppCaptcha } from './helpers/app-login'
import { loginAs } from './helpers/login'

describe('M2-R R3 信任治理闭环（admin 处置/复核/退驻/协议留痕）', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: string // 超管（* 权限，含 /governance）
  let reporter: string // U1001 陈屿（举报人）
  let publisher: string // U1005 顾北辰（需求发布者 + 申诉人）
  let founderB: string // U1004 周慕深（E2002 芯启半导体负责人，退驻申请人）

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    admin = await loginAs(app)
    reporter = await appLoginAs(app, '13801210001', 'user123')
    publisher = await appLoginAs(app, '13801210005', 'user123')
    founderB = await appLoginAs(app, '13801210004', 'user123')
  })

  afterAll(async () => {
    await app.close()
  })

  it('举报处置：pending 举报 → admin 下架需求 → 需求不可见 + 我的举报已处理 + 重复处置 409 → 恢复', async () => {
    const ownerId = (await prisma.enterprise.findUniqueOrThrow({ where: { id: 'E2004' } })).contactUserId!
    const noticesBefore = await prisma.userNotification.count({ where: { userId: ownerId } })
    // U1001 举报已发布需求 D4002
    const create = await appPost(app, reporter, '/api/app/reports', {
      targetType: 'demand',
      targetId: 'D4002',
      targetTitle: 'SaaS 控制台 UI 设计外包',
      reason: '涉嫌虚假信息',
      detail: '描述与实际不符',
    })
    expect(create.status).toBe(200)
    // 举报只入队，不改变对象状态，不通知内容所属用户。
    expect((await appGet(app, reporter, '/api/app/demands/D4002')).status).toBe(200)
    expect(await prisma.userNotification.count({ where: { userId: ownerId } })).toBe(noticesBefore)

    // admin 队列可见 pending
    const queue = await request(app.getHttpServer()).get('/api/admin/governance/reports?status=pending').set('Authorization', `Bearer ${admin}`)
    expect(queue.status).toBe(200)
    const row = queue.body.data.list.find((r: { targetId: string }) => r.targetId === 'D4002')
    expect(row).toBeTruthy()
    expect(row.status).toBe('pending')

    // 驳回举报时不允许调整举报对象（400 校验）
    const bad = await request(app.getHttpServer())
      .post(`/api/admin/governance/reports/${row.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'rejected', resolution: '证据不足', action: 'hide' })
    expect(bad.status).toBe(400)

    // 处置：resolved + 下架需求
    const review = await request(app.getHttpServer())
      .post(`/api/admin/governance/reports/${row.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'resolved', resolution: '核实属实，已下架处理', action: 'hide' })
    expect(review.status).toBe(200)
    // 处置说明不等于下架理由：未填下架理由时，即使下架也不通知所属用户。
    expect(await prisma.userNotification.count({ where: { userId: ownerId } })).toBe(noticesBefore)

    // 目标是下架：D4002 变为 rejected，不再出现在需求广场/详情
    const hidden = await appGet(app, reporter, '/api/app/demands/D4002')
    expect(hidden.status).toBe(404)

    // 我的举报状态回写 resolved
    const mine = await appGet(app, reporter, '/api/app/me/reports')
    const mineRow = mine.body.data.find((r: { targetId: string }) => r.targetId === 'D4002')
    expect(mineRow.status).toBe('resolved')

    // 重复处置 409（并发防重）
    const dup = await request(app.getHttpServer())
      .post(`/api/admin/governance/reports/${row.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'resolved', resolution: '再处理一次', action: 'none' })
    expect(dup.status).toBe(409)

    // 恢复流：已处置举报重开 review（action=restore）直接恢复对象，无需新的举报提交
    const restoreFlow = await request(app.getHttpServer())
      .post(`/api/admin/governance/reports/${row.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'resolved', action: 'restore', resolution: '经复核误判，恢复上架' })
    expect(restoreFlow.status).toBe(200)
    const visible = await appGet(app, reporter, '/api/app/demands/D4002')
    expect(visible.status).toBe(200)

    // 对象已恢复为 published，再次恢复 409（applyReportAction 条件更新 0 命中）
    const restoreDup = await request(app.getHttpServer())
      .post(`/api/admin/governance/reports/${row.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'resolved', action: 'restore', resolution: '再次恢复' })
    expect(restoreDup.status).toBe(409)

    // 恢复流不允许修改处置结果（非 restore 动作对已处置举报仍 409）
    const restoreBad = await request(app.getHttpServer())
      .post(`/api/admin/governance/reports/${row.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'rejected', resolution: '改判', action: 'none' })
    expect(restoreBad.status).toBe(409)

    // user 目标可再次举报（无发布状态依赖）→ restore 解冻
    const reportUser = await appPost(app, reporter, '/api/app/reports', {
      targetType: 'user',
      targetId: 'U1015',
      targetTitle: '许新言',
      reason: '疑似恶意刷评论',
    })
    expect(reportUser.status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { uid: 'U1015' } })).status).toBe('active')
    const queue2 = await request(app.getHttpServer())
      .get('/api/admin/governance/reports?status=pending')
      .set('Authorization', `Bearer ${admin}`)
    const userReport = queue2.body.data.list.find(
      (r: { targetType: string; targetId: string }) => r.targetType === 'user' && r.targetId === 'U1015',
    )
    expect(userReport).toBeTruthy()

    // hide → 用户被冻结（治理用户状态）
    const freeze = await request(app.getHttpServer())
      .post(`/api/admin/governance/reports/${userReport.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'resolved', resolution: '多次刷评，冻结处置', action: 'hide' })
    expect(freeze.status).toBe(200)
    const frozen = await prisma.user.findUnique({ where: { uid: 'U1015' } })
    expect(frozen?.status).toBe('frozen')
    expect(frozen?.frozenReason).toContain('刷评')

    // 用户目标可再次举报（无发布状态依赖）→ restore 解冻
    const reportUser2 = await appPost(app, reporter, '/api/app/reports', {
      targetType: 'user',
      targetId: 'U1015',
      targetTitle: '许新言',
      reason: '误报，申请恢复',
    })
    expect(reportUser2.status).toBe(200)
    const queue3 = await request(app.getHttpServer())
      .get('/api/admin/governance/reports?status=pending')
      .set('Authorization', `Bearer ${admin}`)
    const userReport2 = queue3.body.data.list.find(
      (r: { targetType: string; targetId: string; status: string }) => r.targetType === 'user' && r.targetId === 'U1015' && r.status === 'pending',
    )
    expect(userReport2).toBeTruthy()
    const restore = await request(app.getHttpServer())
      .post(`/api/admin/governance/reports/${userReport2.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'resolved', resolution: '经复核误报，恢复账号', action: 'restore' })
    expect(restore.status).toBe(200)
    const restored = await prisma.user.findUnique({ where: { uid: 'U1015' } })
    expect(restored?.status).toBe('active')
    expect(restored?.frozenReason).toBeNull()
  })

  it('工作人员下架：举报处置与主动下架均仅在填写理由时通知所属用户', async () => {
    const ownerId = (await prisma.enterprise.findUniqueOrThrow({ where: { id: 'E2004' } })).contactUserId!
    const noticeCount = () => prisma.userNotification.count({ where: { userId: ownerId, title: { startsWith: '内容下架：' } } })
    const before = await noticeCount()
    const review = (id: string, body: object) => request(app.getHttpServer())
      .post(`/api/admin/governance/reports/${id}/review`).set('Authorization', `Bearer ${admin}`).send(body)
    expect((await appPost(app, reporter, '/api/app/reports', { targetType: 'demand', targetId: 'D4002', targetTitle: '需求', reason: '信息有误' })).status).toBe(200)
    const report = await prisma.report.findFirstOrThrow({ where: { targetId: 'D4002', status: 'pending' } })
    expect((await review(report.id, { status: 'resolved', action: 'hide', resolution: '内部复核记录', takedownReason: '请核实预算后再发布' })).status).toBe(200)
    expect(await noticeCount()).toBe(before + 1)
    expect(await prisma.userNotification.count({ where: { userId: ownerId, content: '请核实预算后再发布' } })).toBe(1)
    expect(await prisma.userNotification.count({ where: { userId: ownerId, content: { contains: '内部复核记录' } } })).toBe(0)
    expect((await review(report.id, { status: 'resolved', action: 'restore', resolution: '恢复' })).status).toBe(200)

    // 不需要新的举报，工作人员可主动下架；空白理由也不发信。
    const retract = (body: object) => request(app.getHttpServer()).post('/api/admin/demands/D4002/retract').set('Authorization', `Bearer ${admin}`).send(body)
    expect((await retract({ takedownReason: '   ' })).status).toBe(200)
    expect(await noticeCount()).toBe(before + 1)
    expect((await request(app.getHttpServer()).post('/api/admin/demands/D4002/publish-now').set('Authorization', `Bearer ${admin}`)).status).toBe(200)
    const reason = '更'.repeat(255)
    expect((await retract({ takedownReason: reason })).status).toBe(200)
    expect(await noticeCount()).toBe(before + 2)
    expect(await prisma.userNotification.count({ where: { userId: ownerId, content: reason } })).toBe(1)
    expect((await retract({ takedownReason: reason })).status).toBe(409)
    expect(await noticeCount()).toBe(before + 2)

    const article = await prisma.article.findFirstOrThrow({ where: { status: 'published', deletedAt: null, authorId: { startsWith: 'U' } } })
    const articleNotices = () => prisma.userNotification.count({ where: { userId: article.authorId!, title: { startsWith: '内容下架：' } } })
    const articleBefore = await articleNotices()
    expect((await appPost(app, reporter, '/api/app/reports', { targetType: 'article', targetId: article.id, targetTitle: article.title, reason: '内容存疑' })).status).toBe(200)
    expect((await prisma.article.findUniqueOrThrow({ where: { id: article.id } })).status).toBe('published')
    expect(await articleNotices()).toBe(articleBefore)
    const articleReport = await prisma.report.findFirstOrThrow({ where: { targetId: article.id, status: 'pending' } })
    expect((await review(articleReport.id, { status: 'resolved', action: 'none', resolution: '保留内容', takedownReason: '不应发送' })).status).toBe(200)
    expect((await prisma.article.findUniqueOrThrow({ where: { id: article.id } })).status).toBe('published')
    expect(await articleNotices()).toBe(articleBefore)
    const withdraw = (body: object) => request(app.getHttpServer()).post(`/api/admin/contents/articles/${article.id}/withdraw`).set('Authorization', `Bearer ${admin}`).send(body)
    expect((await withdraw({})).status).toBe(200)
    expect(await articleNotices()).toBe(articleBefore)
    expect((await request(app.getHttpServer()).post(`/api/admin/contents/articles/${article.id}/publish`).set('Authorization', `Bearer ${admin}`)).status).toBe(200)
    expect((await withdraw({ takedownReason: '资料已过期，请更新' })).status).toBe(200)
    expect(await articleNotices()).toBe(articleBefore + 1)
  })

  it('申诉复核：被驳回需求 → 申诉写入 Appeal → 复核通过回 pending；重复申诉/复核 409；驳回分支保持 rejected', async () => {
    // U1005 发布需求 → admin 驳回
    const created = await appPost(app, publisher, '/api/app/demands', {
      title: 'R3 治理申诉测试需求',
      description: '用于申诉复核闭环验证',
      categoryCode: 'DC001',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'community_individual',
      contactName: '顾北辰',
      contactPhone: '13801210005',
      deliverable: '一周内输出方案',
      deliverBy: '2026-10-20',
    })
    expect(created.status).toBe(200)
    const demandId = created.body.data.id

    const reject = await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId}/reject`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ reason: '材料不完整，请补充后申诉' })
    expect(reject.status).toBe(200)

    // 申诉：写 Appeal 记录 + 需求 status=appealed
    const appeal = await appPost(app, publisher, `/api/app/me/demands/${demandId}/appeal`, {
      reason: '已补充完整材料，请复核',
    })
    expect(appeal.status).toBe(200)
    const appealDb = (await prisma.appeal.findFirst({ where: { targetType: 'demand', targetId: demandId } }))!
    expect(appealDb).toBeTruthy()
    expect(appealDb.status).toBe('pending')
    const appealed = await prisma.demand.findUnique({ where: { id: demandId } })
    expect(appealed?.status).toBe('appealed')

    // 重复申诉 409（仅 rejected 可申诉）
    const dupAppeal = await appPost(app, publisher, `/api/app/me/demands/${demandId}/appeal`, { reason: '再次申诉' })
    expect(dupAppeal.status).toBe(409)

    // admin 复核通过 → 需求回 pending
    const review = await request(app.getHttpServer())
      .post(`/api/admin/governance/appeals/${appealDb.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ decision: 'accepted', resolution: '材料已补齐，恢复审核' })
    expect(review.status).toBe(200)
    const restored = await prisma.demand.findUnique({ where: { id: demandId } })
    expect(restored?.status).toBe('pending')
    const appealAfter = await prisma.appeal.findUnique({ where: { id: appealDb.id } })
    expect(appealAfter?.status).toBe('resolved')

    // 重复复核 409（并发防重）
    const dupReview = await request(app.getHttpServer())
      .post(`/api/admin/governance/appeals/${appealDb.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ decision: 'rejected', resolution: '重复处理' })
    expect(dupReview.status).toBe(409)

    // 驳回分支：第二条需求复核 rejected → 保持 rejected
    const created2 = await appPost(app, publisher, '/api/app/demands', {
      title: 'R3 治理申诉驳回分支',
      description: '复核驳回分支验证',
      categoryCode: 'DC001',
      categoryDict: 'demand_category',
      kind: 'cooperation',
      asIdentity: 'community_individual',
      contactName: '顾北辰',
      contactPhone: '13801210005',
      bottleneck: '缺乏渠道资源，寻求合作',
    })
    expect(created2.status).toBe(200)
    const demandId2 = created2.body.data.id
    await request(app.getHttpServer())
      .post(`/api/admin/demands/${demandId2}/reject`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ reason: '不符合发布规范' })
    await appPost(app, publisher, `/api/app/me/demands/${demandId2}/appeal`, { reason: '请求复核' })
    const appeal2 = (await prisma.appeal.findFirst({ where: { targetType: 'demand', targetId: demandId2 } }))!
    await request(app.getHttpServer())
      .post(`/api/admin/governance/appeals/${appeal2.id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ decision: 'rejected', resolution: '复核维持原判' })
    const stillRejected = await prisma.demand.findUnique({ where: { id: demandId2 } })
    expect(stillRejected?.status).toBe('rejected')
  })

  it('退驻审核：负责人提交 → admin 通过 → 企业 exited + 展示名片下线；重复处理 409', async () => {
    const submit = await appPost(app, founderB, '/api/app/me/enterprises/E2002/exit-application', {
      reason: '业务调整，迁往外地园区',
    })
    expect(submit.status).toBe(200)
    const dup = await appPost(app, founderB, '/api/app/me/enterprises/E2002/exit-application', {})
    expect(dup.status).toBe(409)

    const appRow = (await prisma.application.findFirst({
      where: { type: 'exit', targetName: '芯启半导体', status: 'pending' },
    }))!
    expect(appRow).toBeTruthy()

    const approve = await request(app.getHttpServer())
      .post(`/api/admin/applications/${appRow.id}/approve`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ comment: '同意退驻，已办理场地交接' })
    expect(approve.status).toBe(200)

    const ent = await prisma.enterprise.findUnique({ where: { id: 'E2002' } })
    expect(ent?.status).toBe('exited')
    expect(ent?.showcaseStatus).toBe('none')

    // 重复审批 409（并发防重）
    const dupApprove = await request(app.getHttpServer())
      .post(`/api/admin/applications/${appRow.id}/approve`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ comment: '重复处理' })
    expect(dupApprove.status).toBe(409)

    // 申请人收到审核结果站内信
    const notices = await appGet(app, founderB, '/api/app/notices?page=1&pageSize=20')
    expect(notices.body.data.list.some((n: { title: string }) => n.title.includes('企业退驻'))).toBe(true)
  })

  it('协议版本实际留痕：注册 AgreementConsent.version 与 Policy 版本一致', async () => {
    const { captchaId, captchaCode } = await fetchAppCaptcha(app)
    const reg = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({ phone: '13900118866', password: 'pass1234', nickname: '治理测试新用户', agreed: true, captchaId, captchaCode })
    expect(reg.status).toBe(200)
    const uid = reg.body.data.uid

    const consents = await prisma.agreementConsent.findMany({ where: { userId: uid } })
    expect(consents.length).toBe(2)
    const policies = await prisma.policy.findMany({
      where: { kind: { in: ['agreement_user', 'agreement_privacy'] } },
      select: { kind: true, version: true },
    })
    const versionByKind = new Map(policies.map((p) => [p.kind, p.version]))
    const typeToKind: Record<string, string> = { user_agreement: 'agreement_user', privacy_policy: 'agreement_privacy' }
    for (const consent of consents) {
      expect(consent.version).toBe(versionByKind.get(typeToKind[consent.agreementType]))
    }
  })
})
