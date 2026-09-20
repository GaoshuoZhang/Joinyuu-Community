/* 内置 V1.0 协议兜底：正式部署只跑迁移、未在后台发布协议时，
 * 协议下发与注册仍需可用（避免「用户协议或隐私政策尚未发布」阻断注册）。
 * 前置：docker compose up + prisma migrate + seed；用户密码 user123 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { fetchAppCaptcha } from './helpers/app-login'

describe('内置 V1.0 协议兜底', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
  })

  afterAll(async () => {
    await app.close()
  })

  it('未发布协议时：接口回退内置 V1.0，未知 kind 仍 404', async () => {
    await prisma.policy.updateMany({
      where: { kind: { in: ['agreement_user', 'agreement_privacy'] } },
      data: { status: 'archive' },
    })

    const user = await request(app.getHttpServer()).get('/api/app/policies/user_agreement')
    expect(user.status).toBe(200)
    expect(user.body.data.builtIn).toBe(true)
    expect(user.body.data.version).toBe('1.0')
    expect(user.body.data.title).toBe('聚屿社区用户协议')
    expect(user.body.data.content).toContain('总则')
    expect(user.body.data.publishedAt).toBeTruthy()

    const privacy = await request(app.getHttpServer()).get('/api/app/policies/privacy_policy')
    expect(privacy.status).toBe(200)
    expect(privacy.body.data.builtIn).toBe(true)
    expect(privacy.body.data.title).toBe('聚屿社区隐私政策')
    expect(privacy.body.data.content).toContain('信息的使用')

    const unknown = await request(app.getHttpServer()).get('/api/app/policies/unknown_kind')
    expect(unknown.status).toBe(404)
  })

  it('未发布协议时注册成功，同意留痕使用内置 V1.0 版本', async () => {
    const { captchaId, captchaCode } = await fetchAppCaptcha(app)
    const reg = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({
        phone: '13911112222',
        password: 'user12345',
        nickname: '兜底协议验收',
        agreed: true,
        captchaId,
        captchaCode,
      })
    expect(reg.status).toBe(200)
    const uid: string = reg.body.data.uid
    const consents = await prisma.agreementConsent.findMany({ where: { userId: uid }, orderBy: { agreementType: 'asc' } })
    expect(consents.map((c) => c.agreementType)).toEqual(['privacy_policy', 'user_agreement'])
    expect(consents.every((c) => c.version === '1.0')).toBe(true)
  })

  it('有已发布协议时优先下发数据库版本（builtIn=false）', async () => {
    await prisma.policy.updateMany({ where: { id: 'PL1001' }, data: { status: 'published', publishedAt: '2026-02-01 09:00' } })
    const res = await request(app.getHttpServer()).get('/api/app/policies/user_agreement')
    expect(res.status).toBe(200)
    expect(res.body.data.builtIn).toBe(false)
    expect(res.body.data.publishedAt).toBe('2026-02-01 09:00')
  })
})
