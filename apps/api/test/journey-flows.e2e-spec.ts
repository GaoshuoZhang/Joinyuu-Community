/* M2-R 三端联调 e2e（客户端 + 管理后台全链路）：
 * 注册 → 登录 → 实名认证 → 入驻申请（人才登记/企业入驻，后台审核）→ 个人/企业名片编辑（两端）
 * → 需求发布（后台审核/发布）→ 需求响应 → 发布者选定 → 管理员立项 → 里程碑提交/验收结项
 * → 空间预约（后台审核）→ 活动报名（后台审核）+ 客户端/后台签到 → 商城兑换（后台发货）→ 确认收货 → 评价。
 * 前置：docker compose up + prisma migrate + seed；管理员 admin/admin123，种子成员 13801210005/user123。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { addDays, formatToday } from '../src/common/utils/time'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appLoginRequest, appPost, sendAppSmsCode } from './helpers/app-login'
import { loginAs } from './helpers/login'

const PASSWORD = 'journey123'
const PHONE = '13900009001'
/* 注册时不再填昵称（服务端自动分配），此处姓名用于实名认证与名片展示 */
const NICKNAME = '联调用户'
const CITIZEN_ID = '110101199001010015'
const ENTERPRISE_NAME = '联调智造科技（测试）'
const DEMAND_TITLE = '联调需求-移动端联调测试'

describe('M2-R 三端联调：注册/实名/入驻/需求/项目/活动/商城/名片/空间', () => {
  let app: INestApplication
  let prisma: PrismaService
  let adminToken: string
  let userToken = ''
  let uid = ''
  let enterpriseId = ''
  let demandId = ''
  let projectId = ''

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    adminToken = await loginAs(app)
  })

  afterAll(async () => {
    await app.close()
  })

  const adminGet = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${adminToken}`)
  const adminPost = (path: string, body?: Record<string, unknown>) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${adminToken}`).send(body ?? {})
  const put = (path: string, body: Record<string, unknown>, token = userToken) =>
    request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${token}`).send(body)
  const asList = <T>(data: unknown): T[] =>
    (Array.isArray(data) ? data : (data as { list?: T[] } | null)?.list ?? []) as T[]

  it('① 注册：验证码 + 协议同意 → 新账号可直接登录', async () => {
    const code = await sendAppSmsCode(app, PHONE, 'register')
    const reg = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({ channel: 'phone', phone: PHONE, code, password: PASSWORD, agreed: true })
    expect(reg.status).toBe(200)
    expect(reg.body.data.token).toBeTruthy()
    uid = reg.body.data.uid
    expect(uid).toBeTruthy()
    /* 昵称与用户名由服务端自动分配 */
    const nickname = reg.body.data.name as string
    expect(nickname).toMatch(/^岛民\d{6}$/)
    expect(String(reg.body.data.username)).toMatch(/^user_[a-z0-9]{8}$/)

    const login = await appLoginRequest(app, PHONE, PASSWORD)
    expect(login.status).toBe(200)
    userToken = login.body.data.token
    const me = await appGet(app, userToken, '/api/app/me')
    expect(me.status).toBe(200)
    expect(me.body.data.nickname).toBe(nickname)
    expect(asList<{ type: string }>(me.body.data.identities).some((i) => i.type === 'individual')).toBe(true)
  })

  it('② 实名认证：客户端提交并通过规则校验后立即生效', async () => {
    const submit = await put('/api/app/me/realname', { realName: NICKNAME, citizenId: CITIZEN_ID })
    expect(submit.status).toBe(200)
    const status = await appGet(app, userToken, '/api/app/me/realname')
    expect(status.body.data.verified).toBe(true)
    expect(status.body.data.verifiedAt).toEqual(expect.any(String))
  })

  it('③ 入驻申请：人才登记 + 企业入驻提交 → 后台审核通过 → 身份与企业实体生效', async () => {
    const schema = await appGet(app, userToken, '/api/app/application-form/settle')
    expect(schema.status).toBe(200)
    expect(Array.isArray(schema.body.data.fields)).toBe(true)

    const individual = await appPost(app, userToken, '/api/app/applications', {
      type: 'individual',
      fields: { realName: NICKNAME, skills: '联调测试', years: 3, intro: '联调个体登记', contactPhone: PHONE },
      identityType: 'community_individual',
    })
    expect(individual.status).toBe(200)

    const settle = await appPost(app, userToken, '/api/app/applications', {
      type: 'settle',
      fields: {
        companyName: ENTERPRISE_NAME,
        creditCode: '91310101MA1JOURNEY',
        industry: '专业服务',
        companySize: '1-9 人',
        officeNeeds: '1-2 个办公位',
        settleDate: addDays(formatToday(), 10),
        contactName: NICKNAME,
        contactPhone: PHONE,
        intro: '联调测试企业',
        businessLicense: [{ name: '营业执照.pdf', size: 1024, url: '/api/public/files/journey/license.pdf' }],
      },
      identityType: 'community_enterprise',
    })
    expect(settle.status).toBe(200)

    const pending = await adminGet('/api/admin/applications?status=pending&page=1&pageSize=100')
    const rows = asList<{ id: string; type: string; applicantPhone: string }>(pending.body.data)
    const indRow = rows.find((r) => r.type === 'individual' && r.applicantPhone === PHONE)
    const settleRow = rows.find((r) => r.type === 'settle' && r.applicantPhone === PHONE)
    expect(indRow).toBeTruthy()
    expect(settleRow).toBeTruthy()
    expect((await adminPost(`/api/admin/applications/${indRow!.id}/approve`, { comment: '联调通过' })).status).toBe(200)
    expect((await adminPost(`/api/admin/applications/${settleRow!.id}/approve`, { comment: '联调通过' })).status).toBe(200)

    const identities = await appGet(app, userToken, '/api/app/me/identities')
    expect(identities.status).toBe(200)
    const identityRows = asList<{ type: string; enterpriseId?: string; name?: string }>(identities.body.data)
    expect(identityRows.some((i) => i.type === 'community_individual')).toBe(true)
    const ent = identityRows.find((i) => i.type === 'community_enterprise' && i.enterpriseId)
    expect(ent?.enterpriseId).toBeTruthy()
    enterpriseId = ent!.enterpriseId!

    const detail = await appGet(app, userToken, `/api/app/me/enterprises/${enterpriseId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.enterpriseName).toBe(ENTERPRISE_NAME)
  })

  it('④ 个人名片：客户端编辑 → 后台可读可改 → 字段白名单读写', async () => {
    const save = await put('/api/app/me/cards/individual', {
      displayName: NICKNAME,
      intro: '联调个人简介',
      skills: ['联调', '测试'],
    })
    expect(save.status).toBe(200)
    const mine = await appGet(app, userToken, '/api/app/me/cards')
    expect(mine.status).toBe(200)
    expect(JSON.stringify(mine.body.data)).toContain('联调个人简介')

    const adminRead = await adminGet(`/api/admin/cards/individual/${uid}`)
    expect(adminRead.status).toBe(200)
    expect(JSON.stringify(adminRead.body.data)).toContain('联调个人简介')

    const adminWrite = await put(`/api/admin/cards/individual/${uid}`, { intro: '后台修订简介' }, adminToken)
    expect(adminWrite.status).toBe(200)
    const after = await appGet(app, userToken, '/api/app/me/cards')
    expect(JSON.stringify(after.body.data)).toContain('后台修订简介')

    const schema = await adminGet('/api/admin/cards/schema/individual')
    expect(schema.status).toBe(200)
    expect(Array.isArray(schema.body.data.editableFields)).toBe(true)
    const saveSchema = await put('/api/admin/cards/schema/individual', { editableFields: schema.body.data.editableFields }, adminToken)
    expect(saveSchema.status).toBe(200)
  })

  it('⑤ 企业名片：客户端编辑 → 后台可读可改', async () => {
    const save = await put(`/api/app/me/enterprises/${enterpriseId}`, {
      website: 'https://journey.example.com',
      address: '上海市杨浦区联调路 1 号',
      services: ['联调测试服务'],
    })
    expect(save.status).toBe(200)
    const detail = await appGet(app, userToken, `/api/app/me/enterprises/${enterpriseId}`)
    expect(detail.body.data.address).toContain('联调路')

    const adminRead = await adminGet(`/api/admin/cards/enterprise/${enterpriseId}`)
    expect(adminRead.status).toBe(200)
    expect(JSON.stringify(adminRead.body.data)).toContain('journey.example.com')
    const adminWrite = await put(`/api/admin/cards/enterprise/${enterpriseId}`, { description: '后台补充企业简介' }, adminToken)
    expect(adminWrite.status).toBe(200)
  })

  it('⑥ 需求发布：企业主体提交 → 后台审核 → 立即发布', async () => {
    const created = await appPost(app, userToken, '/api/app/demands', {
      title: DEMAND_TITLE,
      description: '联调端到端需求描述：验证发布审核到响应立项全链路。',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'community_enterprise',
      asEnterpriseId: enterpriseId,
      deliverable: '联调交付物与说明文档',
      deliverBy: addDays(formatToday(), 30),
      budget: '1 万以内',
      contactName: NICKNAME,
      contactPhone: PHONE,
    })
    expect(created.status).toBe(200)
    demandId = created.body.data.id

    const pending = await adminGet(`/api/admin/demands?status=pending&keyword=${encodeURIComponent(DEMAND_TITLE)}&page=1&pageSize=100`)
    const row = asList<{ id: string }>(pending.body.data).find((r) => r.id === demandId)
    expect(row).toBeTruthy()
    expect((await adminPost(`/api/admin/demands/${demandId}/approve`)).status).toBe(200)
    expect((await adminPost(`/api/admin/demands/${demandId}/publish-now`)).status).toBe(200)

    const detail = await appGet(app, userToken, `/api/app/demands/${demandId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.status).toBe('published')
  })

  it('⑦ 需求响应：其他成员响应 → 发布者查看响应列表', async () => {
    const responder = await appLoginAs(app, '13801210005', 'user123')
    const resp = await appPost(app, responder, `/api/app/demands/${demandId}/respond`, {
      note: '联调承接响应',
      quote: '1 万',
    })
    expect(resp.status).toBe(200)

    const list = await appGet(app, userToken, `/api/app/me/demands/${demandId}/responses`)
    expect(list.status).toBe(200)
    expect(list.body.data.length).toBe(1)
    expect(list.body.data[0].status).toBe('pending')
  })

  it('⑧ 立项：发布者选定意向承接方 → 管理员手动立项（状态与项目关联）', async () => {
    const list = await appGet(app, userToken, `/api/app/me/demands/${demandId}/responses`)
    const responseId = list.body.data[0].id
    const selected = await appPost(app, userToken, `/api/app/me/demands/${demandId}/select`, { responseIds: [responseId] })
    expect(selected.status).toBe(200)
    const afterSelect = await prisma.demand.findUniqueOrThrow({ where: { id: demandId } })
    expect(afterSelect.status).toBe('selected')

    const initiated = await adminPost(`/api/admin/demands/${demandId}/initiate-project`, {
      projectName: '联调项目-移动端联调',
      undertakers: [{ type: 'individual', id: 'U1005', share: 100 }],
      description: '联调立项承接',
      milestones: [
        { name: '联调方案确认', date: addDays(formatToday(), 14), owners: [] },
        { name: '联调交付验收', date: addDays(formatToday(), 30), owners: [] },
      ],
      expReward: 100,
    })
    expect(initiated.status).toBe(200)
    projectId = initiated.body.data.id
    expect(projectId).toBeTruthy()

    const after = await prisma.demand.findUniqueOrThrow({ where: { id: demandId } })
    expect(after.status).toBe('projected')
    expect(after.projectId).toBe(projectId)
  })

  it('⑨ 验收：承接方提交里程碑 → 发布者验收 → 项目自动结项', async () => {
    const responder = await appLoginAs(app, '13801210005', 'user123')
    const detail = await appGet(app, responder, `/api/app/me/projects/${projectId}`)
    expect(detail.status).toBe(200)
    for (const m of detail.body.data.milestones) {
      const submit = await appPost(app, responder, `/api/app/me/projects/${projectId}/milestones/${m.id}/submit`, {
        note: '联调交付完成',
      })
      expect(submit.status).toBe(200)
      const accept = await appPost(app, userToken, `/api/app/me/projects/${projectId}/milestones/${m.id}/accept`, {})
      expect(accept.status).toBe(200)
    }
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(project.status).toBe('finished')
  })

  it('⑩ 空间预约：客户端企业主体提交 → 后台审核通过 → 我的预约生效', async () => {
    const date = addDays(formatToday(), 3)
    const spaces = await appGet(app, userToken, '/api/app/spaces')
    const spaceRows = asList<{ id: string; status: string }>(spaces.body.data)
    const space = spaceRows.find((s) => s.status === 'open' || s.status === 'available') ?? spaceRows[0]
    expect(space).toBeTruthy()
    /* 固定为「需审核」空间，覆盖后台审核链路 */
    await prisma.space.update({ where: { id: space.id }, data: { needApproval: true } })

    const availability = await appGet(app, userToken, `/api/app/spaces/${space.id}/availability?date=${date}`)
    const free = asList<{ start: string; end: string; occupied: boolean }>(availability.body.data).find((s) => !s.occupied)
    expect(free).toBeTruthy()
    const created = await appPost(app, userToken, '/api/app/spaces/reservations', {
      spaceId: space.id,
      date,
      start: free!.start,
      end: free!.end,
      topic: '联调空间预约',
      attendees: 2,
      asIdentity: 'community_enterprise',
      asEnterpriseId: enterpriseId,
    })
    expect([200, 201]).toContain(created.status)
    expect(created.body.data.status).toBe('pending')

    const mine = await appGet(app, userToken, '/api/app/me/reservations')
    const row = asList<{ id: string; spaceId: string; date: string; status: string }>(mine.body.data).find(
      (r) => r.spaceId === space.id && r.date === date,
    )
    expect(row).toBeTruthy()
    expect(row!.status).toBe('pending')

    const review = await adminPost(`/api/admin/space-reservations/${row!.id}/review`, {
      status: 'approved',
      comment: '联调通过',
    })
    expect(review.status).toBe(200)
    const after = await appGet(app, userToken, '/api/app/me/reservations')
    expect(asList<{ id: string; status: string }>(after.body.data).find((r) => r.id === row!.id)?.status).toBe('approved')
  })

  it('⑪ 活动报名与签到：客户端报名 → 后台审核 → 客户端签到核销 + 后台补签', async () => {
    const enroll = await appPost(app, userToken, '/api/app/events/EV6001/enroll', {})
    expect(enroll.status).toBe(200)
    expect(enroll.body.data.status).toBe('pending')

    const review = await adminPost(`/api/admin/events/EV6001/enrollments/${uid}/review`, { status: 'approved' })
    expect(review.status).toBe(200)

    /* 调整活动时间窗（无地理位置活动仅校验时间窗），使客户端签到可用 */
    const fmt = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const start = new Date(Date.now() + 5 * 60 * 1000)
    await prisma.communityEvent.update({
      where: { id: 'EV6001' },
      data: { startTime: fmt(start), endTime: fmt(new Date(start.getTime() + 60 * 60 * 1000)) },
    })

    const ticket = await appGet(app, userToken, '/api/app/events/EV6001/ticket')
    expect(ticket.status).toBe(200)
    expect(ticket.body.data.status).toBe('valid')
    const checkin = await appPost(app, userToken, '/api/app/events/EV6001/check-in', { lat: 31.23, lng: 121.47 })
    expect(checkin.status).toBe(200)
    const after = await appGet(app, userToken, '/api/app/events/EV6001/ticket')
    expect(after.body.data.status).toBe('checked')

    /* 后台侧签到：管理员为已通过报名的 U1005 复核并补签 */
    const seedReview = await adminPost('/api/admin/events/EV6001/enrollments/U1005/review', { status: 'approved' })
    expect(seedReview.status).toBe(200)
    const manualCheckin = await adminPost('/api/admin/events/EV6001/checkin', { userId: 'U1005' })
    expect(manualCheckin.status).toBe(200)
  })

  it('⑫ 商城评价：兑换 → 后台发货 → 客户端确认收货 → 评价回写', async () => {
    const buyer = await appLoginAs(app, '13801210005', 'user123')
    const addr = await appPost(app, buyer, '/api/app/me/addresses', {
      name: '顾北辰',
      phone: '13801210005',
      address: '上海市杨浦区联调路 1 号',
      isDefault: true,
    })
    expect(addr.status).toBe(200)

    const goods = await appGet(app, buyer, '/api/app/mall/goods')
    const goodsRows = asList<{ id: string }>(goods.body.data)
    const target = goodsRows.find((g) => g.id === 'G1003') ?? goodsRows[0]
    const order = await appPost(app, buyer, '/api/app/mall/orders', { goodsId: target.id, addressId: addr.body.data.id })
    expect(order.status).toBe(200)
    const orderId = order.body.data.id

    const ship = await adminPost(`/api/admin/mall/redemption-orders/${orderId}/ship`, { trackingNo: 'SF000JOURNEY' })
    expect(ship.status).toBe(200)
    const confirm = await appPost(app, buyer, `/api/app/mall/orders/${orderId}/confirm`, {})
    expect(confirm.status).toBe(200)
    const review = await appPost(app, buyer, `/api/app/mall/orders/${orderId}/review`, {
      rating: 5,
      comment: '联调好评',
    })
    expect(review.status).toBe(200)

    const mine = await appGet(app, buyer, '/api/app/me/orders')
    const row = asList<{ id: string; rating?: number; ratingScore?: number }>(mine.body.data).find((o) => o.id === orderId)
    expect(row).toBeTruthy()
    expect(row!.rating ?? row!.ratingScore).toBe(5)

    const persisted = await prisma.redemptionOrder.findUniqueOrThrow({ where: { id: orderId } })
    expect(persisted.status).toBe('finished')
    expect(persisted.rating).toBe(5)
    expect(persisted.reviewComment).toBe('联调好评')
  })
})
