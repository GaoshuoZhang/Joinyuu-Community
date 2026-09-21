import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { appLoginAs } from './helpers/app-login'

describe('admin policy endpoint boundaries', () => {
  let app: INestApplication
  let prisma: PrismaService
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    token = await loginAs(app)
  })

  afterAll(async () => app?.close())

  const auth = () => ({ Authorization: `Bearer ${token}` })

  it('lists only the kinds owned by each admin domain', async () => {
    const legacy = await request(app.getHttpServer()).get('/api/admin/governance/policies').set(auth())
    expect(legacy.status).toBe(404)

    const community = await request(app.getHttpServer()).get('/api/admin/contents/policies').set(auth())
    expect(community.status).toBe(200)
    expect(community.body.data.length).toBeGreaterThan(0)
    expect(community.body.data.every((row: { kind: string }) => row.kind === 'community')).toBe(true)

    const agreements = await request(app.getHttpServer()).get('/api/admin/system/policies').set(auth())
    expect(agreements.status).toBe(200)
    expect(agreements.body.data.length).toBeGreaterThan(0)
    expect(agreements.body.data.every((row: { kind: string }) => ['agreement_user', 'agreement_privacy'].includes(row.kind))).toBe(true)

    expect((await request(app.getHttpServer()).get('/api/app/policies/user_agreement')).status).toBe(200)
    const appToken = await appLoginAs(app, '13801210001', 'user123')
    expect((await request(app.getHttpServer()).get('/api/app/community/policies').set('Authorization', `Bearer ${appToken}`)).status).toBe(200)
  })

  it('forces community kind and persists community-only fields', async () => {
    const created = await request(app.getHttpServer()).post('/api/admin/contents/policies').set(auth()).send({
      kind: 'agreement_user',
      category: '办事指南',
      title: '政策边界测试',
      summary: '验证社区政策字段',
      content: '<p>政策正文</p>',
      version: '3.0',
      effectiveAt: '2026-09-20',
      status: 'published',
      featured: true,
      attachments: [{ name: '申报表', url: '/api/public/files/policy-form.pdf' }],
    })
    expect(created.status).toBe(200)
    expect(created.body.data).toMatchObject({ kind: 'community', featured: true })
    expect(created.body.data.attachments).toEqual([{ name: '申报表', url: '/api/public/files/policy-form.pdf' }])
    expect(await prisma.auditLog.findFirst({ where: { target: { startsWith: created.body.data.id } }, select: { module: true } })).toEqual({ module: '内容管理' })

    const agreement = await prisma.policy.findFirstOrThrow({ where: { kind: 'agreement_user' } })
    const crossed = await request(app.getHttpServer()).put(`/api/admin/contents/policies/${agreement.id}`).set(auth()).send({
      category: '越权修改', title: '越权修改', content: '越权修改', version: '9.9', status: 'published',
    })
    expect(crossed.status).toBe(404)
  })

  it('rejects unsupported agreement kinds and cannot update community records', async () => {
    const invalid = await request(app.getHttpServer()).post('/api/admin/system/policies').set(auth()).send({
      kind: 'community', title: '错误类型', content: '正文', version: '1.0', status: 'published',
    })
    expect(invalid.status).toBe(400)

    const created = await request(app.getHttpServer()).post('/api/admin/system/policies').set(auth()).send({
      kind: 'agreement_privacy', title: '隐私政策边界测试', summary: '测试摘要', content: '<p>协议正文</p>', version: '2.0', status: 'archived',
    })
    expect(created.status).toBe(200)
    expect(created.body.data).toMatchObject({ kind: 'agreement_privacy', category: '-', featured: false, attachments: [] })
    expect(await prisma.auditLog.findFirst({ where: { target: { startsWith: created.body.data.id } }, select: { module: true } })).toEqual({ module: '系统管理' })

    const community = await prisma.policy.findFirstOrThrow({ where: { kind: 'community' } })
    const crossed = await request(app.getHttpServer()).put(`/api/admin/system/policies/${community.id}`).set(auth()).send({
      kind: 'agreement_privacy', title: '越权修改', content: '正文', version: '9.9', status: 'published',
    })
    expect(crossed.status).toBe(404)
  })
})
