/* M2-R R3 复查补验：管理端下架通知 / 退驻审核 / 协议版本留痕
 * 前置：docker compose up（PG/Redis/MinIO healthy）+ reseed；app 用户密码 user123；admin 超管 admin/admin123
 * 覆盖用户复查改动：主动下架通知规则、退驻审核→exited、注册协议版本实际留痕 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost, sendAppSmsCode } from './helpers/app-login'
import { loginAs } from './helpers/login'

describe('M2-R R3 管理端下架/退驻/协议留痕', () => {
  let app: INestApplication
  let prisma: PrismaService
  let admin: string // 超管（* 权限，含 /governance）
  let _publisher: string // U1005 顾北辰（需求发布者）
  let founderB: string // U1004 周慕深（E2002 芯启半导体负责人，退驻申请人）

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    admin = await loginAs(app)
    _publisher = await appLoginAs(app, '13801210005', 'user123')
    founderB = await appLoginAs(app, '13801210004', 'user123')
  })

  afterAll(async () => {
    await app.close()
  })

  it('主动下架仅在填写理由时通知所属用户', async () => {
    const ownerId = (await prisma.enterprise.findUniqueOrThrow({ where: { id: 'E2004' } })).contactUserId!
    const noticeCount = () => prisma.userNotification.count({ where: { userId: ownerId, title: { startsWith: '内容下架：' } } })
    const before = await noticeCount()
    // 不需要新的举报，工作人员可主动下架；空白理由也不发信。
    const retract = (body: object) => request(app.getHttpServer()).post('/api/admin/demands/D4002/retract').set('Authorization', `Bearer ${admin}`).send(body)
    expect((await retract({ takedownReason: '   ' })).status).toBe(200)
    expect(await noticeCount()).toBe(before)
    expect((await request(app.getHttpServer()).post('/api/admin/demands/D4002/publish-now').set('Authorization', `Bearer ${admin}`)).status).toBe(200)
    const reason = '更'.repeat(255)
    expect((await retract({ takedownReason: reason })).status).toBe(200)
    expect(await noticeCount()).toBe(before + 1)
    expect(await prisma.userNotification.count({ where: { userId: ownerId, content: reason } })).toBe(1)
    expect((await retract({ takedownReason: reason })).status).toBe(409)
    expect(await noticeCount()).toBe(before + 1)

    const article = await prisma.article.findFirstOrThrow({ where: { status: 'published', deletedAt: null, authorId: { startsWith: 'U' } } })
    const articleNotices = () => prisma.userNotification.count({ where: { userId: article.authorId!, title: { startsWith: '内容下架：' } } })
    const articleBefore = await articleNotices()
    const withdraw = (body: object) => request(app.getHttpServer()).post(`/api/admin/contents/articles/${article.id}/withdraw`).set('Authorization', `Bearer ${admin}`).send(body)
    expect((await withdraw({})).status).toBe(200)
    expect((await prisma.article.findUniqueOrThrow({ where: { id: article.id } })).status).toBe('closed')
    expect(await articleNotices()).toBe(articleBefore)
    expect((await request(app.getHttpServer()).post(`/api/admin/contents/articles/${article.id}/restore`).set('Authorization', `Bearer ${admin}`)).status).toBe(200)
    expect((await withdraw({ takedownReason: '资料已过期，请更新' })).status).toBe(200)
    expect(await articleNotices()).toBe(articleBefore + 1)
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
    const code = await sendAppSmsCode(app, '13900118866', 'register')
    const reg = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({ channel: 'phone', phone: '13900118866', code, password: 'pass1234', agreed: true })
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
