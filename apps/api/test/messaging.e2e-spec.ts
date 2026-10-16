/* P0 消息中心 · 渠道配置 e2e：
 * 覆盖：驱动目录、渠道新增/编辑/启停、配置与凭据校验、凭据不回传、测试发送（干跑）、权限 403。
 * 前置：docker compose up + prisma migrate + seed（迁移 20260920190000_p0_message_center）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('P0 消息中心 · 渠道配置', () => {
  let app: INestApplication
  let token: string
  let auditorToken: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    token = await loginAs(app)
    auditorToken = await loginAs(app, 'auditor')
  })

  afterAll(async () => {
    await app.close()
  })

  const get = (path: string, as = token) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${as}`)
  const put = (path: string, as = token) =>
    request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${as}`)
  const patch = (path: string, as = token) =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${as}`)
  const post = (path: string, as = token) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${as}`)

  /** 基础载荷：阿里云短信渠道 */
  const basePayload = {
    kind: 'sms',
    provider: 'aliyun_sms',
    name: '阿里云短信',
    enabled: true,
    config: { signName: '聚屿社区', templateMapping: { verify_code: 'SMS_12345678' } },
    credentialEnv: {
      accessKeyId: 'ALIYUN_SMS_ACCESS_KEY_ID',
      accessKeySecret: 'ALIYUN_SMS_ACCESS_KEY_SECRET',
    },
    dailyLimit: 1000,
    remark: '主通道',
  }

  /** 腾讯云短信载荷：配置与凭据字段均与阿里云不同，用于「同一通知类型切换驱动」 */
  const tencentPayload = {
    kind: 'sms',
    provider: 'tencent_sms',
    name: '腾讯云短信',
    enabled: true,
    config: { sdkAppId: '1400000001', signName: '聚屿社区', templateMapping: { verify_code: '1234567' } },
    credentialEnv: { secretId: 'TENCENT_SMS_SECRET_ID', secretKey: 'TENCENT_SMS_SECRET_KEY' },
    dailyLimit: 1000,
    remark: '备用通道',
  }

  it('驱动目录：返回消息类型与阿里云/腾讯云/SMTP 驱动', async () => {
    const res = await get('/api/admin/message-channels/catalog')
    expect(res.status).toBe(200)
    expect(res.body.data.kinds).toEqual(['sms', 'email', 'inapp'])
    const providers = (res.body.data.providers as Array<{ provider: string; supports: string[] }>).map(
      (p) => p.provider,
    )
    expect(providers).toEqual(
      expect.arrayContaining(['aliyun_sms', 'tencent_sms', 'smtp', 'inapp', 'dry_run']),
    )
  })

  it('禁止隐式新增：同驱动已配置 → 409；同类型不同驱动 → 409', async () => {
    /* 每种通知类型仅一条固定配置：种子已含 sms/aliyun_sms，新增同 kind+provider 直接 409 */
    const sameDriver = await post('/api/admin/message-channels').send(basePayload)
    expect(sameDriver.status).toBe(409)
    expect(sameDriver.body.message).toContain('已配置')

    const sameKind = await post('/api/admin/message-channels').send(tencentPayload)
    expect(sameKind.status).toBe(409)
    expect(sameKind.body.message).toContain('已有固定配置')
  })

  it('固定配置：PUT /fixed/:kind 切换短信驱动（腾讯云 ⇄ 阿里云），数量不变且凭据不回传', async () => {
    const before = (await get('/api/admin/message-channels')).body.data as Array<Record<string, unknown>>
    const smsRows = before.filter((c) => c.kind === 'sms')
    expect(smsRows).toHaveLength(1)
    const id = smsRows[0].id as string

    const switched = await put('/api/admin/message-channels/fixed/sms').send(tencentPayload)
    expect(switched.status).toBe(200)
    expect(switched.body.data.id).toBe(id)

    const after = (await get('/api/admin/message-channels')).body.data as Array<Record<string, unknown>>
    expect(after.filter((c) => c.kind === 'sms')).toHaveLength(1)
    const row = after.find((c) => c.id === id)!
    expect(row.kind).toBe('sms')
    expect(row.providerLabel).toBe('腾讯云短信')
    expect(row.enabled).toBe(true)
    /* 凭据值不回传：只有变量名映射与齐备状态（未注入环境变量 → 未齐备） */
    expect(row.credentialEnv).toEqual({
      secretId: 'TENCENT_SMS_SECRET_ID',
      secretKey: 'TENCENT_SMS_SECRET_KEY',
    })
    expect(row.credentialConfigured).toBe(false)
    expect(row.missingCredentials).toEqual(
      expect.arrayContaining(['TENCENT_SMS_SECRET_ID', 'TENCENT_SMS_SECRET_KEY']),
    )
    expect(JSON.stringify(row)).not.toContain('TENCENT_SMS_SECRET_KEY=')

    /* 切回种子口径（阿里云），保证后续用例与种子一致 */
    const restored = await put('/api/admin/message-channels/fixed/sms').send(basePayload)
    expect(restored.status).toBe(200)
    const finalRow = (
      (await get('/api/admin/message-channels')).body.data as Array<Record<string, unknown>>
    ).find((c) => c.id === id)!
    expect(finalRow.provider).toBe('aliyun_sms')
    expect(finalRow.name).toBe('阿里云短信')
    expect(finalRow.enabled).toBe(true)
  })

  it('编辑已有渠道：PUT /:id 为更新而非新增（种子 MC1），并可切换启停', async () => {
    const before = (await get('/api/admin/message-channels')).body.data as Array<{ id: string; provider: string }>
    const count = before.length
    const target = before.find((c) => c.provider === 'aliyun_sms')!

    const updated = await put(`/api/admin/message-channels/${target.id}`).send({
      ...basePayload,
      name: '阿里云短信（备）',
      enabled: false,
      dailyLimit: 0,
    })
    expect(updated.status).toBe(200)
    expect(updated.body.data.id).toBe(target.id)

    const after = (await get('/api/admin/message-channels')).body.data as Array<Record<string, unknown>>
    expect(after).toHaveLength(count)
    const channel = after.find((c) => c.id === target.id)!
    expect(channel.name).toBe('阿里云短信（备）')
    expect(channel.enabled).toBe(false)

    const toggled = await patch(`/api/admin/message-channels/${target.id}/enabled`).send({
      enabled: true,
    })
    expect(toggled.status).toBe(200)
    expect(toggled.body).toEqual({ code: 0, data: { code: 0 } })
  })

  it('校验：驱动与消息类型不匹配 / 必填配置缺失 / 凭据项非法 均 400', async () => {
    const mismatch = await put('/api/admin/message-channels').send({
      ...basePayload,
      provider: 'smtp',
      kind: 'sms',
    })
    expect(mismatch.status).toBe(400)
    expect(mismatch.body.message).toContain('不支持消息类型')

    const missingConfig = await put('/api/admin/message-channels').send({
      ...basePayload,
      provider: 'tencent_sms',
      config: {},
    })
    expect(missingConfig.status).toBe(400)
    expect(missingConfig.body.message).toContain('请填写')

    const badEnvKey = await put('/api/admin/message-channels').send({
      ...basePayload,
      credentialEnv: { wrongKey: 'SOME_ENV' },
    })
    expect(badEnvKey.status).toBe(400)
    expect(badEnvKey.body.message).toContain('不属于该驱动')

    const badEnvName = await put('/api/admin/message-channels').send({
      ...basePayload,
      credentialEnv: { accessKeyId: 'lower_case_name' },
    })
    expect(badEnvName.status).toBe(400)
    expect(badEnvName.body.message).toContain('环境变量名不合法')
  })

  it('测试发送：凭据未注入时非生产环境降级干跑，返回回执且不抛错', async () => {
    const list = await get('/api/admin/message-channels')
    const channel = (list.body.data as Array<{ id: string; provider: string }>).find(
      (c) => c.provider === 'aliyun_sms',
    )!
    const res = await post(`/api/admin/message-channels/${channel.id}/test-send`).send({
      recipient: '13800000000',
      body: '验证码 {{code}}，{{minutes}} 分钟内有效。',
      variables: { code: '1234', minutes: '5' },
    })
    expect(res.status).toBe(200)
    expect(res.body.data.dryRun).toBe(true)
    expect(String(res.body.data.providerMessageId)).toMatch(/^dry-/)
  })

  it('权限：具备审核角色（无该权限码）访问渠道配置 → 403', async () => {
    const res = await get('/api/admin/message-channels', auditorToken)
    expect(res.status).toBe(403)
  })

  it('渠道凭据 inline：直接填写入参只写不泄露，留空保持原值，审计不含密钥原文', async () => {
    /* 编辑已有渠道走 PUT /:id：凭空新增同 kind+provider 已被服务端禁止（409） */
    const channels = (await get('/api/admin/message-channels')).body.data as Array<{ id: string; provider: string }>
    const id = channels.find((c) => c.provider === 'aliyun_sms')!.id

    const inline = {
      ...basePayload,
      credentialMode: 'inline',
      credentialEnv: { accessKeyId: 'AKID-INLINE-TEST-0001', accessKeySecret: 'secret-inline-value-xyz' },
    }
    const created = await put(`/api/admin/message-channels/${id}`).send(inline)
    expect(created.status).toBe(200)

    const dirty = await get('/api/admin/message-channels')
    const channel = (dirty.body.data as Array<Record<string, unknown>>).find((c) => c.id === id)!
    expect(channel.credentialMode).toBe('inline')
    expect(channel.credentialConfigured).toBe(true)
    /* inline 模式不回传变量名，只回掩码，且不含密钥原文 */
    expect(channel.credentialEnv).toEqual({})
    expect(channel.credentialMasked).toEqual({ accessKeyId: '********', accessKeySecret: '********' })
    const serialized = JSON.stringify(channel)
    expect(serialized).not.toContain('AKID-INLINE-TEST-0001')
    expect(serialized).not.toContain('secret-inline-value-xyz')

    /* 留空 = 保持原值（仅改名） */
    const keep = await put(`/api/admin/message-channels/${id}`).send({
      ...basePayload,
      credentialMode: 'inline',
      name: '阿里云短信（inline）',
      credentialEnv: {},
    })
    expect(keep.status).toBe(200)
    const afterKeep = (await get('/api/admin/message-channels')).body.data as Array<Record<string, unknown>>
    expect(afterKeep.find((c) => c.id === id)!.credentialConfigured).toBe(true)

    /* 仅轮换其中一项，另一项继续保持 */
    const rotate = await put(`/api/admin/message-channels/${id}`).send({
      ...basePayload,
      credentialMode: 'inline',
      credentialEnv: { accessKeySecret: 'rotated-secret-002' },
    })
    expect(rotate.status).toBe(200)
    const afterRotate = (await get('/api/admin/message-channels')).body.data as Array<Record<string, unknown>>
    expect(afterRotate.find((c) => c.id === id)!.credentialConfigured).toBe(true)

    /* 库内可用（服务端可解密到明文用于调用），但审计不留密钥原文 */
    const prisma = new PrismaClient()
    try {
      const row = await prisma.messageChannel.findUnique({ where: { id } })
      expect(row?.credentialMode).toBe('inline')
      expect(JSON.stringify(row?.credentialEnv)).toContain('rotated-secret-002')

      const logs = await prisma.auditLog.findMany({
        where: { module: '消息中心', action: '保存消息渠道' },
        orderBy: { id: 'desc' },
        take: 6,
      })
      expect(logs.length).toBeGreaterThan(0)
      for (const log of logs) {
        const text = JSON.stringify({ detail: log.detail, before: log.before, after: log.after })
        expect(text).not.toContain('AKID-INLINE-TEST-0001')
        expect(text).not.toContain('secret-inline-value-xyz')
        expect(text).not.toContain('rotated-secret-002')
      }
    } finally {
      await prisma.$disconnect()
    }
  })

  it('渠道凭据：未知凭据项被拒绝（400）', async () => {
    const res = await put('/api/admin/message-channels').send({
      ...basePayload,
      credentialMode: 'inline',
      credentialEnv: { notAField: 'whatever' },
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('不属于该驱动')
  })
})

/* P0 消息中心 · 模板（简化流程）：创建即发布、编辑保存即生效。 */
describe('P0 消息中心 · 模板（保存即发布）', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    token = await loginAs(app)
  })

  afterAll(async () => {
    await app.close()
  })

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)
  const put = (path: string) =>
    request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${token}`)
  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`)

  const payload = {
    code: 'test_p0_email',
    name: '测试邮件模板',
    kind: 'email',
    category: 'marketing',
    variables: ['nickname'],
    subject: 'hi {{nickname}}',
    body: '你好 {{nickname}}',
  }

  it('创建模板即发布（v1 published），无需审批', async () => {
    const created = await post('/api/admin/message-templates').send(payload)
    expect(created.status).toBe(200)
    const id = created.body.data.id as string

    const detail = await get(`/api/admin/message-templates/${id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.status).toBe('published')
    expect(detail.body.data.currentVersion).toBe(1)
    expect(detail.body.data.versions[0].status).toBe('published')
  })

  it('编辑保存即发布：正文立即更新、版本不变、状态保持 published', async () => {
    const list = await get('/api/admin/message-templates')
    const tpl = (list.body.data as Array<{ id: string; code: string }>).find(
      (t) => t.code === 'test_p0_email',
    )!

    const saved = await put(`/api/admin/message-templates/${tpl.id}/draft`).send({
      name: '测试邮件模板',
      category: 'marketing',
      variables: ['nickname'],
      subject: 'hi {{nickname}}',
      body: '你好 {{nickname}}，欢迎回来！',
    })
    expect(saved.status).toBe(200)

    const detail = await get(`/api/admin/message-templates/${tpl.id}`)
    expect(detail.body.data.status).toBe('published')
    expect(detail.body.data.currentVersion).toBe(1)
    expect(detail.body.data.versions[0].body).toContain('欢迎回来')
  })

  it('模板测试发送：按已启用渠道投递并返回回执', async () => {
    const both = await request(app.getHttpServer()).get('/api/admin/message-channels').set('Authorization', `Bearer ${token}`)
    const emailChannel = (both.body.data as Array<{ id: string; kind: string }>).find((c) => c.kind === 'email')!
    expect(emailChannel).toBeTruthy()

    const list = await get('/api/admin/message-templates')
    const tpl = (list.body.data as Array<{ id: string; code: string }>).find(
      (t) => t.code === 'test_p0_email',
    )!
    const res = await post(`/api/admin/message-templates/${tpl.id}/test-send`).send({
      recipient: 'dev@example.com',
      variables: { nickname: '张三' },
    })
    expect(res.status).toBe(200)
    expect(res.body.data.dryRun).toBe(true)
    expect(String(res.body.data.providerMessageId)).toMatch(/^dry-/)
  })
})
