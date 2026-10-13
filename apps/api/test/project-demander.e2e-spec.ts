/* 项目需求方与访问权限 e2e：
 * 立项后项目照搬需求方/联系人/合同价格；企业需求方的联系人（U1001）可访问项目且出现在「我的项目」，无关用户 403。
 * 说明：后台自建需求的提交人现由服务端按登录工作人员派生（DTO 不再接受 publisher*），
 *       本用例关注「需求方为企业」的立项与访问链路，故建单后按企业主体回填需求方快照。
 * 前置：docker compose up + prisma migrate + seed（用户密码 user123，管理员 admin/admin123）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs } from './helpers/app-login'
import { loginAs } from './helpers/login'

describe('项目需求方快照与访问权限', () => {
  let app: INestApplication
  let prisma: PrismaService
  let adminToken: string
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

  const adminPost = (path: string, body?: Record<string, unknown>) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${adminToken}`).send(body ?? {})

  it('企业需求方立项：项目照搬需求方快照', async () => {
    const created = await adminPost('/api/admin/demands', {
      title: 'e2e 企业代发需求-需求方快照',
      category: 'DC001',
      demandType: 'task',
      budget: '¥66,000',
      period: '',
      deadline: '',
      description: '<p>e2e</p>',
      visibilityIdentities: [],
      visibilityLevels: [],
      enrollmentIdentities: [],
      enrollmentLevels: [],
      contactName: '陈屿',
      contactPhone: '13801210001',
      contactEmail: 'chenyu@example.com',
    })
    expect(created.status).toBe(200)
    const demandId = created.body.data.id as string
    /* 提交人由服务端派生（后台工作人员）；按企业主体回填需求方快照，覆盖“企业为需求方”的立项链路 */
    await prisma.demand.update({
      where: { id: demandId },
      data: {
        publisherId: 'E2001',
        publisherName: '星澜智能科技',
        publisherIdentity: { type: 'community_enterprise', enterpriseId: 'E2001' },
      },
    })

    expect((await adminPost(`/api/admin/demands/${demandId}/publish-now`)).status).toBe(200)
    const initiated = await adminPost(`/api/admin/demands/${demandId}/initiate-project`, {
      projectName: 'e2e 企业代发需求立项项目',
      undertakers: [{ type: 'individual', id: 'U1005', share: 100 }],
      description: '<p>e2e</p>',
      milestones: [
        { name: '项目立项', date: '2026-09-22', owners: [] },
        { name: '预期交付', date: '2026-11-01', owners: ['顾北辰'] },
      ],
      expReward: 100,
    })
    expect(initiated.status).toBe(200)
    projectId = initiated.body.data.id as string

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data).toMatchObject({
      sourceDemandId: demandId,
      demanderId: 'E2001',
      demanderName: '星澜智能科技',
      /* 立项时 creator 取来源需求的提交人快照 */
      creatorName: '星澜智能科技',
      contactName: '陈屿',
      contactPhone: '13801210001',
      contactEmail: 'chenyu@example.com',
      contractPrice: '¥66,000',
    })
    expect(detail.body.data.demanderIdentity).toMatchObject({ type: 'community_enterprise', enterpriseId: 'E2001' })
  })

  it('企业联系人（需求方）可访问项目并出现在「我的项目」', async () => {
    const contactToken = await appLoginAs(app, '13801210001', 'user123')
    const detail = await appGet(app, contactToken, `/api/app/me/projects/${projectId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.role).toBe('需求发起方')

    const mine = await appGet(app, contactToken, '/api/app/me/projects')
    expect(mine.status).toBe(200)
    expect((mine.body.data as Array<{ id: string }>).some((p) => p.id === projectId)).toBe(true)
  })

  it('无关用户访问该项目仍返回 403', async () => {
    const otherToken = await appLoginAs(app, '13801210015', 'user123')
    const detail = await appGet(app, otherToken, `/api/app/me/projects/${projectId}`)
    expect(detail.status).toBe(403)
  })
})
