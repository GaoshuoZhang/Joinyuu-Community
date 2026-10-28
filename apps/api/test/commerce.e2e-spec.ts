import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { PaymentConfigService } from '../src/modules/commerce/payment-config.service'
import { AppMallService } from '../src/modules/app/mall/mall.service'
import { AppSpacesService } from '../src/modules/app/spaces/spaces.service'
import { SchedulerService } from '../src/scheduler/scheduler.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from 'bcryptjs'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { CommercePaymentService } from '../src/modules/commerce/commerce-payment.service'
import { WechatApiError, WechatPayClient } from '../src/modules/commerce/wechat-pay.client'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('交易经营：隔离数据库、渠道mock', () => {
  let app: INestApplication, db: PrismaService, admin: string, reviewer: string, billId: string, paymentId: string
  let sourceId: string, buyerId: string
  const oldEncryptionKey = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY
  const merchantKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const platformKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const configBody = { version: 0, enabled: false, mchid: '1234567890', appid: 'wxtest123', serial: 'ABC123', publicKeyId: 'PUB_KEY_ID_123', base: 'https://example.invalid', key: '12345678901234567890123456789012', privateKey: merchantKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKey: platformKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
  const credentials = { mchid: '1234567890', appid: 'wxtest123', base: 'https://example.invalid' }
  const wx = {
    config: jest.fn(() => ({ ready: true, enabled: true })), assertCanCreate: jest.fn(() => credentials), credentials: jest.fn(() => credentials),
    inspectConfig: jest.fn(() => ({ ready: false, enabled: false, requested: false, fields: [], checkedAt: new Date().toISOString(), notifyUrl: null })),
    prepay: jest.fn(async () => ({ code_url: 'weixin://wxpay/mock-only' })), query: jest.fn(), close: jest.fn(async () => ({})),
    queryRefund: jest.fn(), refund: jest.fn(), decryptNotification: jest.fn(),
  }
  const post = (path: string, body: object = {}, token?: string) => request(app.getHttpServer()).post('/api/admin/commerce/' + path).set('Authorization', `Bearer ${token ?? admin}`).send(body)
  const billBody = (title: string) => ({ module: 'event', sourceId, buyerType: 'user', buyerId, title, period: 'first', amountFen: 12800, dueDate: '2026-12-01', agreement: '已确认的自营服务及退款约定' })
  const success = () => ({ appid: credentials.appid, mchid: credentials.mchid, out_trade_no: paymentId, transaction_id: 'wx-mock-transaction', trade_state: 'SUCCESS', success_time: new Date().toISOString(), amount: { total: 12800, currency: 'CNY' } })
  beforeAll(async () => {
    process.env.PAYMENT_CONFIG_ENCRYPTION_KEY = randomBytes(32).toString('hex')
    reseed()
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(WechatPayClient).useValue(wx).compile()
    app = module.createNestApplication({ rawBody: true }); await app.init(); db = app.get(PrismaService)
    await db.paymentMerchantConfig.deleteMany({ where: { id: 'wechat' } })
    admin = await loginAs(app)
    const role = await db.adminRole.findUniqueOrThrow({ where: { code: 'super' } })
    await db.adminUser.create({ data: { username: 'commerce-reviewer', name: '财务复核测试', passwordHash: await hash('test-reviewer-pass', 4), roles: { create: { roleId: role.id } } } })
    reviewer = await loginAs(app, 'commerce-reviewer', 'test-reviewer-pass')
    sourceId = (await db.communityEvent.findFirstOrThrow({ where: { deletedAt: null, status: { in: ['published', 'pending_release'] } } })).id
    buyerId = (await db.user.findFirstOrThrow({ where: { status: 'active' } })).uid
  })
  afterAll(async () => { if (db) await db.paymentMerchantConfig.deleteMany({ where: { id: 'wechat' } }); if (app) await app.close(); if (oldEncryptionKey === undefined) delete process.env.PAYMENT_CONFIG_ENCRYPTION_KEY; else process.env.PAYMENT_CONFIG_ENCRYPTION_KEY = oldEncryptionKey })

  it('普通运营角色无财务权限，未登录不可查询', async () => {
    expect((await request(app.getHttpServer()).get('/api/admin/commerce/overview')).status).toBe(401)
    const operator = await loginAs(app, 'operator')
    expect((await request(app.getHttpServer()).get('/api/admin/commerce/overview').set('Authorization', `Bearer ${operator}`)).status).toBe(403)
  })
  it('收款配置检查沿用系统配置权限且不需要财务写权限', async () => {
    const path = '/api/admin/system/payment-config'
    expect((await request(app.getHttpServer()).get(path)).status).toBe(401)
    const operator = await loginAs(app, 'operator')
    expect((await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${operator}`)).status).toBe(403)
    const result = await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${admin}`)
    expect(result.status).toBe(200)
    expect(result.body.data.enabled).toBe(false)
  })
  it('页面配置可保存并即时读取；密钥加密、只写、空值保留、版本冲突及文件校验', async () => {
    const put = (body: object, token = admin) => request(app.getHttpServer()).put('/api/admin/system/payment-config/wechat').set('Authorization', `Bearer ${token}`).send(body)
    const operator = await loginAs(app, 'operator')
    expect((await put(configBody, operator)).status).toBe(403)
    expect((await put({ ...configBody, privateKey: 'not-a-key' })).status).toBe(400)
    expect((await put({ ...configBody, certificate: 'not-a-certificate' })).status).toBe(400)
    const result = await put(configBody)
    expect(result.status).toBe(200)
    expect(result.body.data.ready).toBe(true)
    expect(result.body.data.secrets.privateKey).toBe(true)
    expect(JSON.stringify(result.body)).not.toContain('BEGIN PRIVATE KEY')
    expect(JSON.stringify(result.body)).not.toContain(configBody.key)
    const stored = await db.paymentMerchantConfig.findUniqueOrThrow({ where: { id: 'wechat' } })
    expect(stored.ciphertext).not.toContain(configBody.key)
    expect(stored.ciphertext).not.toContain('PRIVATE KEY')
    expect((await put(configBody)).status).toBe(409)
    const retained = await put({ ...configBody, version: 1, enabled: true, privateKey: '', publicKey: '', key: '' })
    expect(retained.status).toBe(200)
    expect(retained.body.data.enabled).toBe(true)
    const runtime = await app.get(PaymentConfigService).runtime()
    expect(runtime.key).toBe(configBody.key)
    expect(runtime.privateKey.trim()).toBe(configBody.privateKey.trim())
    expect((await new WechatPayClient(app.get(PaymentConfigService)).assertCanCreate()).mchid).toBe(configBody.mchid)
    const audit = await db.auditLog.findMany({ where: { action: '保存微信收款配置' } })
    expect(JSON.stringify(audit)).not.toContain(configBody.key)
    expect(JSON.stringify(audit)).not.toContain('PRIVATE KEY')
  })
  it('互斥售价、不过期券码及现金业务不能通过积分接口免费完成', async () => {
    const base = await db.mallGoods.findFirstOrThrow({ where: { deletedAt: null } })
    const path = '/api/admin/mall/goods'
    const body = { ...base, name: '不过期券码测试', points: 1, stock: 3, validDays: 0, chargeAmountFen: 0, chargeRefundPolicy: '', visibilityIdentities: [], visibilityLevels: [], orderIdentities: [], orderLevels: [] }
    const create = (payload: object) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${admin}`).send(payload)
    expect((await create({ ...body, chargeAmountFen: 100, chargeRefundPolicy: '交付前可退' })).status).toBe(400)
    const created = await create(body)
    expect(created.status).toBe(200)
    const id = created.body.data.id
    await db.mallGoods.update({ where: { id }, data: { status: 'on' } })
    await db.user.update({ where: { uid: buyerId }, data: { points: 100 } })
    const order = await app.get(AppMallService).createOrder(buyerId, { goodsId: id })
    expect((await db.redemptionOrder.findUniqueOrThrow({ where: { id: order.id } })).voucherExpiresAt).toBe('')
    await app.get(SchedulerService).scanVoucherExpiry()
    expect((await db.redemptionOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('pending_use')
    await db.mallGoods.update({ where: { id }, data: { points: 0, chargeAmountFen: 100, chargeRefundPolicy: '交付前可退' } })
    const before = await db.mallGoods.findUniqueOrThrow({ where: { id } })
    await expect(app.get(AppMallService).createOrder(buyerId, { goodsId: id })).rejects.toThrow('现金')
    expect((await db.mallGoods.findUniqueOrThrow({ where: { id } })).stock).toBe(before.stock)
    const space = await db.space.findFirstOrThrow({ where: { deletedAt: null } })
    const spaceBody = { ...space, name: '互斥空间测试', needReservation: true, feePerHour: 1, chargeAmountFen: 100, chargeRefundPolicy: '开始前可退' }
    const mixed = await request(app.getHttpServer()).post('/api/admin/spaces').set('Authorization', `Bearer ${admin}`).send(spaceBody)
    expect(mixed.status).toBe(400)
    const cash = await request(app.getHttpServer()).post('/api/admin/spaces').set('Authorization', `Bearer ${admin}`).send({ ...spaceBody, feePerHour: 0 })
    expect(cash.status).toBe(200)
    await expect(app.get(AppSpacesService).create({ uid: buyerId, name: '测试' }, { spaceId: cash.body.data.id, date: '2026-12-01', start: '10:00', end: '11:00' })).rejects.toThrow('现金')
  })
  it('活动/商品/空间原业务新增/编辑接口持久化价格与退款约定', async () => {
    const event = await db.communityEvent.findFirstOrThrow({ where: { deletedAt: null } })
    const space = await db.space.findFirstOrThrow({ where: { deletedAt: null } })
    const goods = await db.mallGoods.findFirstOrThrow({ where: { deletedAt: null } })
    const bases = [
      { path: 'events', body: { ...event, title: '现金费用测试活动' } },
      { path: 'spaces', body: { ...space, name: '现金费用测试空间' } },
      { path: 'mall/goods', body: { ...goods, name: '现金费用测试商品' } },
    ]
    for (const { path, body } of bases) {
      const payload = { ...body, points: 0, feePerHour: 0, chargeAmountFen: 1299, chargeRefundPolicy: '交付前可申请退款' }
      const created = await request(app.getHttpServer()).post('/api/admin/' + path).set('Authorization', `Bearer ${admin}`).send(payload)
      expect({ path, ok: [200, 201].includes(created.status), message: created.body.message }).toEqual({ path, ok: true, message: undefined })
      const id = created.body.data.id
      const updated = await request(app.getHttpServer()).put(`/api/admin/${path}/${id}`).set('Authorization', `Bearer ${admin}`).send({ ...payload, chargeAmountFen: 2599, chargeRefundPolicy: '开始前一天可退' })
      expect({ path, status: updated.status, message: updated.body.message }).toEqual({ path, status: 200, message: undefined })
      const module = ({ demands: 'demand', events: 'event', spaces: 'space', 'mall/goods': 'mall', projects: 'project' })[path]
      const quote = await request(app.getHttpServer()).get(`/api/admin/commerce/sources/${id}?module=${module}`).set('Authorization', `Bearer ${admin}`)
      expect(quote.body.data.amountFen).toBe(2599)
      expect(quote.body.data.refundPolicy).toBe('开始前一天可退')
    }
  })
  it('租约/空间/活动/商城能出账；需求/项目新收费暂缓', async () => {
    const sources = [
      ['demand', (await db.demand.findFirstOrThrow({ where: { deletedAt: null } })).id],
      ['project', (await db.project.findFirstOrThrow({ where: { deletedAt: null } })).id],
      ['lease', (await db.lease.findFirstOrThrow({ where: { deletedAt: null } })).id],
      ['space', (await db.space.findFirstOrThrow({ where: { deletedAt: null } })).id],
      ['mall', (await db.mallGoods.findFirstOrThrow({ where: { deletedAt: null } })).id], ['event', sourceId],
    ]
    for (const [module, id] of sources) {
      const data = { chargeAmountFen: 12800, chargeRefundPolicy: '取消未使用服务可退款' }
      if (module === 'demand' || module === 'project') { expect((await post('bills', { ...billBody('暂缓收费'), module, sourceId: id })).status).toBe(400); continue }
      if (module === 'space') await db.space.update({ where: { id }, data: { ...data, feePerHour: 0 } })
      if (module === 'mall') await db.mallGoods.update({ where: { id }, data: { ...data, points: 0 } })
      if (module === 'event') await db.communityEvent.update({ where: { id }, data })
      if (module === 'lease') await db.lease.update({ where: { id }, data: { monthlyRent: 128 } })
      const result = await post('bills', { ...billBody('模块测试'), module, sourceId: id })
      expect(result.status).toBe(201)
      expect(result.body.data.paidFen).toBe(0)
    }
  })
  it('并发重复出账只有一笔；非法金额、日期和业务被拒绝', async () => {
    const results = await Promise.all([post('bills', billBody('唯一账单')), post('bills', billBody('唯一账单'))])
    expect(results.map(x => x.status).sort()).toEqual([201, 409])
    billId = results.find(x => x.status === 201)!.body.data.id
    expect((await post('bills', { ...billBody('bad'), amountFen: 1.1 })).status).toBe(400)
    expect((await post('bills', { ...billBody('bad'), dueDate: '2026-99-99' })).status).toBe(400)
    expect((await post('bills', { ...billBody('bad'), sourceId: 'not-exists' })).status).toBe(404)
  })
  it('同一账单两次并发发起付款只产生同一商户单号和相同参数', async () => {
    wx.prepay.mockClear()
    const results = await Promise.all([post(`bills/${billId}/native-payment`), post(`bills/${billId}/native-payment`)])
    expect(results.every(x => x.status === 200)).toBe(true)
    paymentId = results[0].body.data.id
    expect(results[1].body.data.id).toBe(paymentId)
    expect(wx.prepay.mock.calls.length).toBeGreaterThan(0)
    const calls = wx.prepay.mock.calls as unknown as Array<[unknown]>
    for (const call of calls) expect(call[0]).toEqual(calls[0][0])
    expect(await db.commercePayment.count({ where: { billId } })).toBe(1)
  })
  it('存在待确认支付时不能替换参数，但可关闭发起开关', async () => {
    const put = (body: object) => request(app.getHttpServer()).put('/api/admin/system/payment-config/wechat').set('Authorization', `Bearer ${admin}`).send(body)
    expect((await put({ ...configBody, version: 2, base: 'https://changed.example.invalid' })).status).toBe(409)
    expect((await put({ ...configBody, version: 2, enabled: false, privateKey: '', publicKey: '', key: '' })).status).toBe(200)
    expect((await app.get(PaymentConfigService).inspect()).enabled).toBe(false)
  })
  it('已有支付单不能并行登记线下收款或作废', async () => {
    expect((await post(`bills/${billId}/receipts`, { reference: 'proof', note: '银行转账' })).status).toBe(409)
    expect((await post(`bills/${billId}/void`)).status).toBe(409)
  })
  it('金额或商户不匹配不能入账；并发成功确认只记一次', async () => {
    const service = app.get(CommercePaymentService)
    await expect(service.confirmPayment({ ...success(), amount: { total: 1, currency: 'CNY' } })).rejects.toThrow()
    await expect(service.confirmPayment({ ...success(), mchid: 'wrong' })).rejects.toThrow()
    await Promise.all([service.confirmPayment(success()), service.confirmPayment(success())])
    expect((await db.commerceBill.findUniqueOrThrow({ where: { id: billId } })).paidFen).toBe(12800)
    expect(await db.auditLog.count({ where: { action: '确认微信收款', target: billId } })).toBe(1)
  })
  it('退款额度含待审批额度，同人不能审批，受理不当作成功', async () => {
    wx.query.mockResolvedValue(success())
    const body = { amountFen: 12800, reason: '取消服务' }
    const first = await post(`payments/${paymentId}/refunds`, body)
    expect(first.status).toBe(201)
    let id = first.body.data.id
    expect((await post(`payments/${paymentId}/refunds`, body)).status).toBe(409)
    expect((await post(`refunds/${id}/approve`)).status).toBe(409)
    expect((await post(`refunds/${id}/reject`, {}, reviewer)).status).toBe(200)
    const replacement = await post(`payments/${paymentId}/refunds`, body)
    expect(replacement.status).toBe(201)
    id = replacement.body.data.id
    wx.queryRefund.mockRejectedValueOnce(new WechatApiError('RESOURCE_NOT_EXISTS', 404))
    wx.refund.mockResolvedValue({ out_refund_no: id, out_trade_no: paymentId, status: 'PROCESSING', amount: { total: 12800, refund: 12800, currency: 'CNY' } })
    const approved = await post(`refunds/${id}/approve`, {}, reviewer)
    expect(approved.status).toBe(200)
    expect(approved.body.data.status).toBe('processing')
    expect((await db.commerceBill.findUniqueOrThrow({ where: { id: billId } })).refundedFen).toBe(0)
    wx.queryRefund.mockResolvedValue({ out_refund_no: id, out_trade_no: paymentId, status: 'SUCCESS', amount: { total: 12800, refund: 12800, currency: 'CNY' } })
    await Promise.all([post(`refunds/${id}/sync`), post(`refunds/${id}/sync`)])
    expect((await db.commerceBill.findUniqueOrThrow({ where: { id: billId } })).refundedFen).toBe(12800)
    expect(await db.auditLog.count({ where: { action: '确认微信退款', target: id } })).toBe(1)
  })
  it('线下收款不能自我复核，复核后不能重复记账', async () => {
    const b = (await post('bills', billBody('线下测试'))).body.data
    const receipt = (await post(`bills/${b.id}/receipts`, { reference: 'bank-test-unique', note: '2026-10-28 银行转账凭证' })).body.data
    expect((await post(`receipts/${receipt.id}/review`, { status: 'approved' })).status).toBe(409)
    expect((await post(`receipts/${receipt.id}/review`, { status: 'approved' }, reviewer)).status).toBe(200)
    expect((await post(`receipts/${receipt.id}/review`, { status: 'approved' }, reviewer)).status).toBe(409)
    expect((await db.commerceBill.findUniqueOrThrow({ where: { id: b.id } })).paidFen).toBe(12800)
  })
  it('付款回调无登录即可接收，但无原始报文或验签失败必须拒绝', async () => {
    wx.decryptNotification.mockImplementation(() => { throw new Error('bad signature') })
    const response = await request(app.getHttpServer()).post('/api/payment-notifications/wechat/payment').send({ resource: {} })
    expect(response.status).toBe(400)
    expect(response.body.code).toBe('FAIL')
  })
  it('重复有效回调返回空204，不受全局包络影响，不回滚退款事实', async () => {
    wx.decryptNotification.mockReturnValue({ event: 'TRANSACTION.SUCCESS', payload: success() })
    const response = await request(app.getHttpServer()).post('/api/payment-notifications/wechat/payment').send({ resource: { ciphertext: 'mock' } })
    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect((await db.commerceBill.findUniqueOrThrow({ where: { id: billId } })).refundedFen).toBe(12800)
  })
  it('后台补偿主动查单并关闭超时未付单，之后才允许新尝试', async () => {
    const b = (await post('bills', billBody('超时单'))).body.data
    const first = (await post(`bills/${b.id}/native-payment`)).body.data
    await db.commercePayment.update({ where: { id: first.id }, data: { expiresAt: new Date(Date.now() - 1000), nextCheckAt: new Date(Date.now() - 1000) } })
    wx.query.mockResolvedValue({ ...success(), out_trade_no: first.id, trade_state: 'NOTPAY' })
    await app.get(CommercePaymentService).recover()
    expect(wx.close).toHaveBeenCalledWith(first.id)
    expect((await db.commercePayment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('closed')
    const second = await post(`bills/${b.id}/native-payment`)
    expect(second.status).toBe(200)
    expect(second.body.data.id).not.toBe(first.id)
    await db.commercePayment.update({ where: { id: second.body.data.id }, data: { status: 'closed' } })
  })
  it('业务表单保存定价；改价不改变旧账单快照，篡改金额或数量被拒绝', async () => {
    const event = await db.communityEvent.findUniqueOrThrow({ where: { id: sourceId } })
    const payload = { ...event, chargeAmountFen: 12800, chargeRefundPolicy: '活动开始前可申请退款' }
    const edit = (body: object) => request(app.getHttpServer()).put(`/api/admin/events/${sourceId}`).set('Authorization', `Bearer ${admin}`).send(body)
    expect((await edit(payload)).status).toBe(200)
    const b = (await post('bills', billBody('快照单'))).body.data
    expect(b.snapshot.pricing.unitAmountFen).toBe(12800)
    expect(b.snapshot.pricing.refundPolicy).toBe(payload.chargeRefundPolicy)
    expect((await edit({ ...payload, chargeAmountFen: 20000 })).status).toBe(200)
    const old = await db.commerceBill.findUniqueOrThrow({ where: { id: b.id } })
    expect(old.amountFen).toBe(12800)
    expect(old.snapshot).toEqual(b.snapshot)
    expect((await post('bills', billBody('旧价不接受'))).status).toBe(400)
    expect((await post('bills', { ...billBody('多份'), amountFen: 40000, quantity: 2 })).status).toBe(201)
    expect((await post('bills', { ...billBody('非法数量'), amountFen: 20000, quantity: 0.5 })).status).toBe(400)
    expect((await edit({ ...payload, chargeAmountFen: 0.1 })).status).toBe(400)
    expect((await edit({ ...payload, chargeRefundPolicy: '  ' })).status).toBe(400)
    expect((await edit({ ...payload, chargeAmountFen: 0, chargeRefundPolicy: '' })).status).toBe(200)
    expect((await post('bills', { ...billBody('未设费用'), amountFen: 1 })).status).toBe(400)
    expect((await request(app.getHttpServer()).get(`/api/admin/commerce/sources/${sourceId}?module=event`).set('Authorization', `Bearer ${admin}`)).body.data.amountFen).toBe(0)
  })
  it('独立价目表接口已退役', async () => {
    expect((await post('services', { name: 'deprecated' })).status).toBe(404)
  })
  it('到期许可证阻止新出账，保留存量支付查询', async () => {
    await db.deploymentLicense.update({ where: { id: 'default' }, data: { document: PrismaJsonNull() } })
    expect((await post('bills', billBody('到期后'))).status).toBe(403)
    expect((await post(`payments/${paymentId}/sync`)).status).toBe(200)
  })
})

// Explicit JSON null clears this suite's ephemeral license only.
import { Prisma } from '@prisma/client'
function PrismaJsonNull() { return Prisma.DbNull }
