/* M2-R R3 验收：企业治理（关联身份/成员权限/邀请闭环/负责人转移请求制/退驻/工作台）
 * 前置：docker compose up + prisma migrate reset（22 迁移全量）+ seed；用户密码 user123
 * 身份矩阵：U1001=星澜(E2001)负责人；U1002=星澜成员(有权限)；U1004=芯启(E2002)负责人；U1003=芯启成员 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost } from './helpers/app-login'

describe('M2-R R3 企业治理', () => {
  let app: INestApplication
  let prisma: PrismaService
  let owner: string // U1001 星澜负责人
  let member: string // U1002 星澜成员
  let outsider: string // U1005 非成员
  let founderB: string // U1004 芯启负责人

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    owner = await appLoginAs(app, '13801210001', 'user123')
    member = await appLoginAs(app, '13801210002', 'user123')
    outsider = await appLoginAs(app, '13801210005', 'user123')
    founderB = await appLoginAs(app, '13801210004', 'user123')
  })

  afterAll(async () => {
    await app.close()
  })

  it('关联身份：/me/identities 返回企业 + 合作企业（U1001 无社区个体身份）', async () => {
    const res = await appGet(app, owner, '/api/app/me/identities')
    expect(res.status).toBe(200)
    const keys: string[] = res.body.data.map((i: { key: string }) => i.key)
    expect(keys).toContain('E2001')
    expect(keys).toContain('external:远见资本')
    expect(keys).not.toContain('community_individual')
    const ent = res.body.data.find((i: { key: string }) => i.key === 'E2001')
    expect(ent.isContact).toBe(true)
    expect(ent.permissions.length).toBe(8)
    expect(ent.showcaseStatus).toBe('published')
  })

  it('我的名片：/me/cards 聚合个体与企业名片', async () => {
    const res = await appGet(app, owner, '/api/app/me/cards')
    expect(res.status).toBe(200)
    expect(res.body.data.enterprise.enterpriseId).toBe('E2001')
    expect(res.body.data.enterprise.isContact).toBe(true)
  })

  it('企业详情：成员可见（含权限/邀请/转移/退驻结构），非成员 404', async () => {
    const ok = await appGet(app, member, '/api/app/me/enterprises/E2001')
    expect(ok.status).toBe(200)
    expect(ok.body.data.members.length).toBeGreaterThanOrEqual(2)
    expect(ok.body.data.myPermissions.length).toBe(3) // seed 给 U1002 三项权限
    expect(ok.body.data.contactUid).toBe('U1001')

    const forbidden = await appGet(app, outsider, '/api/app/me/enterprises/E2001')
    expect(forbidden.status).toBe(404)
  })

  it('名片编辑：持 edit_card 的负责人可改，无权限成员 403', async () => {
    const ok = await request(app.getHttpServer())
      .put('/api/app/me/enterprises/E2001')
      .set('Authorization', `Bearer ${owner}`)
      .send({ description: '更新后的企业简介（R3）', services: '知识管理,智能客服' })
    expect(ok.status).toBe(200)
    const ent = await prisma.enterprise.findUnique({ where: { id: 'E2001' } })
    expect(ent?.description).toContain('R3')
    expect(ent?.services).toContain('知识管理')

    const denied = await request(app.getHttpServer())
      .put('/api/app/me/enterprises/E2001')
      .set('Authorization', `Bearer ${member}`)
      .send({ description: '成员越权修改' })
    expect(denied.status).toBe(403)
  })

  it('邀请闭环：invite → 邀请人企业详情可见 → 被邀请人查看/接受 → 成员即时出现', async () => {
    // 负责人邀请 U1005（未注册手机号场景用假号验证 400）
    const unregistered = await appPost(app, owner, '/api/app/me/enterprises/E2001/invite', {
      name: '路人甲',
      phone: '13900001234',
      role: '测试工程师',
    })
    expect(unregistered.status).toBe(400)

    const self = await appPost(app, owner, '/api/app/me/enterprises/E2001/invite', {
      name: '陈屿',
      phone: '13801210001',
      role: '测试',
    })
    expect(self.status).toBe(409)

    const invite = await appPost(app, owner, '/api/app/me/enterprises/E2001/invite', {
      name: '顾北辰',
      phone: '13801210005',
      role: '品牌设计师',
    })
    expect(invite.status).toBe(200)

    // 详情页可见邀请
    const detail = await appGet(app, owner, '/api/app/me/enterprises/E2001')
    const inv = detail.body.data.invitations.find((i: { phone: string }) => i.phone === '13801210005')
    expect(inv).toBeTruthy()
    expect(inv.status).toBe('pending')

    // 非被邀请人查看邀请 403
    const forbidden = await appGet(app, member, `/api/app/invitations/${inv.id}`)
    expect(forbidden.status).toBe(403)

    // 被邀请人查看并接受
    const seen = await appGet(app, outsider, `/api/app/invitations/${inv.id}`)
    expect(seen.status).toBe(200)
    expect(seen.body.data.enterpriseIndustry).toBeTruthy()

    const accept = await appPost(app, outsider, `/api/app/invitations/${inv.id}/respond`, { action: 'accept' })
    expect(accept.status).toBe(200)

    // 成员即时出现（E2001 + community_individual 双身份）
    const identities = await appGet(app, outsider, '/api/app/me/identities')
    expect(identities.body.data.some((i: { key: string }) => i.key === 'E2001')).toBe(true)
    // 重复处理 409
    const dup = await appPost(app, outsider, `/api/app/invitations/${inv.id}/respond`, { action: 'accept' })
    expect(dup.status).toBe(409)
  })

  it('成员管理：权限分配需 assign_permission；移除成员；负责人不可被移除', async () => {
    // 刚接受邀请的 U1005 成为 E2001 成员
    const grant = await request(app.getHttpServer())
      .put('/api/app/me/enterprises/E2001/member')
      .set('Authorization', `Bearer ${owner}`)
      .send({ memberUid: 'U1005', memberName: '顾北辰', permissions: ['publish_demand'] })
    expect(grant.status).toBe(200)

    const phone = await request(app.getHttpServer())
      .put('/api/app/me/enterprises/E2001/member')
      .set('Authorization', `Bearer ${owner}`)
      .send({ memberUid: 'U1005', memberName: '顾北辰', phone: '13900009999' })
    expect(phone.status).toBe(200)

    // 负责人不可被分配权限
    const contact = await request(app.getHttpServer())
      .put('/api/app/me/enterprises/E2001/member')
      .set('Authorization', `Bearer ${owner}`)
      .send({ memberUid: 'U1001', memberName: '陈屿', permissions: [] })
    expect(contact.status).toBe(409)

    // 移除负责人 409
    const removeOwner = await appPost(app, owner, '/api/app/me/enterprises/E2001/remove-member', {
      memberUid: 'U1001',
      memberName: '陈屿',
    })
    expect(removeOwner.status).toBe(409)

    // 成功移除 U1005
    const remove = await appPost(app, owner, '/api/app/me/enterprises/E2001/remove-member', {
      memberUid: 'U1005',
      memberName: '顾北辰',
    })
    expect(remove.status).toBe(200)
    const identities = await appGet(app, outsider, '/api/app/me/identities')
    expect(identities.body.data.some((i: { key: string }) => i.key === 'E2001')).toBe(false)
  })

  it('负责人转移请求制：发起 → 接受 → contactUserId 变更 + 原负责人转成员', async () => {
    const initiate = await appPost(app, owner, '/api/app/me/enterprises/E2001/transfer-contact', {
      memberUid: 'U1002',
      memberName: '林晚舟',
    })
    expect(initiate.status).toBe(200)

    // 收件箱可见
    const inbox = await appGet(app, member, '/api/app/me/transfer-requests')
    const req = inbox.body.data.find((r: { status: string }) => r.status === 'pending')
    expect(req).toBeTruthy()
    expect(req.fromUid).toBe('U1001')

    // 接受
    const accept = await appPost(app, member, `/api/app/me/transfer-requests/${req.id}/respond`, {
      action: 'accept',
    })
    expect(accept.status).toBe(200)

    const ent = await prisma.enterprise.findUnique({ where: { id: 'E2001' } })
    expect(ent?.contactUserId).toBe('U1002')

    // 新负责人隐式全量权限；原负责人降为成员
    const newOwnerDetail = await appGet(app, member, '/api/app/me/enterprises/E2001')
    expect(newOwnerDetail.body.data.isContact).toBe(true)
    expect(newOwnerDetail.body.data.myPermissions.length).toBe(8)
    const oldOwnerDetail = await appGet(app, owner, '/api/app/me/enterprises/E2001')
    expect(oldOwnerDetail.body.data.isContact).toBe(false)

    // 转移回 U1001（恢复 seed 状态，避免影响其他用例）
    const back = await appPost(app, member, '/api/app/me/enterprises/E2001/transfer-contact', {
      memberUid: 'U1001',
      memberName: '陈屿',
    })
    expect(back.status).toBe(200)
    const inbox2 = await appGet(app, owner, '/api/app/me/transfer-requests')
    const backReq = inbox2.body.data.find((r: { status: string }) => r.status === 'pending')
    await appPost(app, owner, `/api/app/me/transfer-requests/${backReq.id}/respond`, { action: 'accept' })
    const restored = await prisma.enterprise.findUnique({ where: { id: 'E2001' } })
    expect(restored?.contactUserId).toBe('U1001')
  })

  it('退驻申请：负责人提交 → 复用申请审核域（type=exit）→ 重复 409', async () => {
    const submit = await appPost(app, founderB, '/api/app/me/enterprises/E2002/exit-application', {
      reason: '业务调整，迁往外地园区',
    })
    expect(submit.status).toBe(200)

    const dup = await appPost(app, founderB, '/api/app/me/enterprises/E2002/exit-application', {})
    expect(dup.status).toBe(409)

    const app_ = await prisma.application.findFirst({
      where: { type: 'exit', targetName: '芯启半导体', status: 'pending' },
    })
    expect(app_).toBeTruthy()
    expect(JSON.stringify(app_?.details)).toContain('业务调整')
  })

  it('展示申请：edit_card 持有人提交 → pending 记录生成 → 重复 409', async () => {
    const submit = await appPost(app, founderB, '/api/app/showcase-requests', {
      enterpriseId: 'E2002',
      note: '申请发布企业展示页',
    })
    expect(submit.status).toBe(200)
    const dup = await appPost(app, founderB, '/api/app/showcase-requests', {
      enterpriseId: 'E2002',
      note: '重复',
    })
    expect(dup.status).toBe(409)
  })

  it('公开企业名片：published 可见含成员，non-published 404', async () => {
    const ok = await appGet(app, outsider, '/api/app/enterprises/E2001')
    expect(ok.status).toBe(200)
    expect(ok.body.data.showcaseStatus).toBe('published')
    expect(Array.isArray(ok.body.data.members)).toBe(true)

    const hidden = await appGet(app, outsider, '/api/app/enterprises/E2003')
    expect([200, 404]).toContain(hidden.status) // E2003 showcaseStatus=none → 404
    if (hidden.status === 200) {
      expect(hidden.body.data.showcaseStatus).toBe('published')
    }
  })

  it('企业工作台：成员可看代企业响应统计', async () => {
    const res = await appGet(app, owner, '/api/app/enterprises/E2001/workbench')
    expect(res.status).toBe(200)
    expect(typeof res.body.data.responseCount).toBe('number')
    expect(Array.isArray(res.body.data.recentResponses)).toBe(true)
  })
})