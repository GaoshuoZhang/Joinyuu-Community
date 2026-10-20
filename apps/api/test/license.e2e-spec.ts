import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { generateKeyPairSync, sign } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { LicenseService } from '../src/common/license/license.service'
import { IdGeneratorService } from '../src/common/id-generator/id-generator.service'
import { PRODUCT_ID } from '../src/common/license/license-format'
import { SchedulerService } from '../src/scheduler/scheduler.service'
import { AppEventsService } from '../src/modules/app/events/events.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { appLoginAs } from './helpers/app-login'

describe('离线许可证与只读模式', () => {
  let app: INestApplication
  let prisma: PrismaService
  let token: string
  let deploymentId: string
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const route = '/api/admin/system/license'
  const post = (path: string, body: object = {}) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).send(body)
  const get = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)
  function signed(changes: Record<string, unknown> = {}) {
    const bytes = Buffer.from(JSON.stringify({
      version: 1, productId: PRODUCT_ID, deploymentId, licenseId: 'L-test', customerId: 'customer-a', customerName: '测试客户', keyId: 'test',
      issuedAt: new Date(Date.now() - 86400000).toISOString(), notBefore: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), updatesUntil: null, ...changes,
    }))
    return { payload: bytes.toString('base64url'), signature: sign(null, bytes, privateKey).toString('base64url') }
  }
  beforeAll(async () => {
    reseed()
    writeFileSync(process.env.E2E_LICENSE_PUBLIC_KEYS_FILE!, JSON.stringify({ test: publicKey.export({ type: 'spki', format: 'pem' }).toString() }))
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = module.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    await prisma.deploymentLicense.deleteMany()
    token = await loginAs(app)
    const responses = await Promise.all(Array.from({ length: 8 }, () => get(route)))
    expect(responses.every(response => response.status === 200)).toBe(true)
    expect(new Set(responses.map(response => response.body.data.deploymentId)).size).toBe(1)
    deploymentId = responses[0].body.data.deploymentId
  })
  afterAll(async () => { if (app) await app.close() })

  it('without a license allows login, queries, export and request generation, blocks writes', async () => {
    expect((await get(route)).body.data.status).toBe('invalid')
    expect((await get('/api/admin/system/config')).status).toBe(200)
    expect((await get('/api/admin/export/users')).status).toBe(200)
    expect((await post('/api/admin/notifications/read-all')).status).toBe(403)
    expect((await request(app.getHttpServer()).delete('/api/admin/system/mobile-themes/nonexistent').set('Authorization', `Bearer ${token}`)).status).toBe(403)
    const a = await post(`${route}/request`, { customerName: '客户 A' })
    const b = await post(`${route}/request`, { customerName: '客户 A' })
    expect(a.status).toBe(200)
    expect(a.body.data.deploymentId).toBe(b.body.data.deploymentId)
    expect((await post(`${route}/request`, { customerName: '   ' })).status).toBe(400)
    const appToken = await appLoginAs(app)
    expect((await request(app.getHttpServer()).post('/api/app/me/data-export').set('Authorization', `Bearer ${appToken}`)).status).toBe(200)
  })
  it('keeps authentication and RBAC on license maintenance', async () => {
    expect((await request(app.getHttpServer()).post(`${route}/import`).send({ content: JSON.stringify(signed()) })).status).toBe(401)
    const limited = await loginAs(app, 'operator')
    const result = await request(app.getHttpServer()).post(`${route}/import`).set('Authorization', `Bearer ${limited}`).send({ content: JSON.stringify(signed()) })
    expect(result.status).toBe(403)
  })
  it('valid import immediately enables writes and records audit; tampering preserves old license', async () => {
    const valid = signed()
    expect((await post(`${route}/import`, { content: JSON.stringify(valid) })).body.data.status).toBe('valid')
    expect((await post('/api/admin/notifications/read-all')).status).toBe(200)
    const tampered = { ...valid, payload: signed({ expiresAt: null }).payload }
    expect((await post(`${route}/import`, { content: JSON.stringify(tampered) })).status).toBe(400)
    expect((await post(`${route}/import`, { content: '{bad' })).status).toBe(400)
    expect((await post(`${route}/import`, { content: JSON.stringify(signed({ deploymentId: 'wrong' })) })).status).toBe(400)
    expect((await get(route)).body.data.status).toBe('valid')
    expect(await prisma.auditLog.count({ where: { module: '许可证管理', action: '导入许可证' } })).toBe(1)
  })
  it('expired license stops business jobs, writes and query side effects; renewal restores immediately', async () => {
    await prisma.deploymentLicense.update({ where: { id: 'default' }, data: { document: signed({ expiresAt: new Date(Date.now() - 1000).toISOString() }) } })
    expect((await get(route)).body.data.status).toBe('expired')
    expect((await post('/api/admin/notifications/read-all')).status).toBe(403)
    expect((await request(app.getHttpServer()).delete('/api/admin/system/mobile-themes/nonexistent').set('Authorization', `Bearer ${token}`)).status).toBe(403)
    expect((await post('/api/app/auth/register')).status).toBe(403)
    /* 客户端登录属维护例外：验证码发码与验证码登录仍放行 … */
    const sendCode = await request(app.getHttpServer()).post('/api/app/auth/sms/send').send({ phone: '13900004444', purpose: 'login' })
    expect(sendCode.status).toBe(200)
    /* … 但「注册受限」仍然成立：未注册标识在维护期只允许登录、不允许建号 */
    const maintenanceCreate = await request(app.getHttpServer())
      .post('/api/app/auth/login-by-code')
      .send({ channel: 'phone', account: '13900004444', code: sendCode.body.data.devCode as string, agreed: true })
    expect(maintenanceCreate.status).toBe(400)
    expect(maintenanceCreate.body.message).toContain('注册暂未开放')
    expect((await get('/api/admin/export/users')).status).toBe(200)
    const jobs = app.get(SchedulerService)
    const scan = jest.spyOn(jobs, 'scanScheduledPublish')
    await jobs.runJob('demands-events-scheduled-publish')
    expect(scan).not.toHaveBeenCalled()
    scan.mockRestore()
    const article = await prisma.article.findFirst({ where: { status: 'published', deletedAt: null } })
    expect(article).not.toBeNull()
    const detail = await request(app.getHttpServer()).get(`/api/app/articles/${article!.id}`)
    expect(detail.status).toBe(200)
    expect((await prisma.article.findUnique({ where: { id: article!.id } }))!.views).toBe(article!.views)
    const enrollment = await prisma.eventEnrollment.findFirst({ where: { status: 'approved' } })
    expect(enrollment).not.toBeNull()
    await prisma.eventTicket.deleteMany({ where: { enrollmentId: enrollment!.id } })
    const events = app.get(AppEventsService)
    await expect(events.myTicket(enrollment!.userId!, String(enrollment!.id))).rejects.toThrow('许可证已到期')
    expect(await prisma.eventTicket.count({ where: { enrollmentId: enrollment!.id } })).toBe(0)
    expect((await post(`${route}/import`, { content: JSON.stringify(signed({ expiresAt: null })) })).body.data.status).toBe('valid')
    const ticket = await events.myTicket(enrollment!.userId!, String(enrollment!.id))
    await prisma.deploymentLicense.update({ where: { id: 'default' }, data: { document: signed({ expiresAt: new Date(Date.now() - 1000).toISOString() }) } })
    expect((await events.myTicket(enrollment!.userId!, String(enrollment!.id))).ticketNo).toBe(ticket.ticketNo)
    await post(`${route}/import`, { content: JSON.stringify(signed({ expiresAt: null })) })
    expect((await post('/api/admin/notifications/read-all')).status).toBe(200)
    expect(await new LicenseService(prisma, app.get(IdGeneratorService)).canWrite()).toBe(true)
  })
})
