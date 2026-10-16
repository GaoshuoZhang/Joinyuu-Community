/* M1-C 项目域验收（wiki-backend.md §13 M1-C）：
 * 新增（share 合计 != 100 → 400；成功 → code=JY-YYYY-NN）+ 暂停/恢复/关闭状态机链
 * + 关闭缺 reason → 400 + 非法流转 → 409。
 * 前置：docker compose up + prisma migrate + seed（P5001 running / P5005 paused / P5002 running、
 *       E2001 星澜智能科技 / U1002 持 community_individual 身份、ExperienceRule project_completed enabled） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1-C projects（新增/编辑/状态机）', () => {
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

  it('新增项目：承接占比合计 != 100 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '占比错误项目',
        undertakers: [{ type: 'enterprise', id: 'E2001', share: 50 }],
        description: '测试',
        milestones: [],
      })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('承接占比合计须为 100%')
  })

  it('新增项目：无承接方 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectName: '无承接方项目', undertakers: [], description: '测试', milestones: [] })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('请至少选择一个承接方')
  })

  it('新增项目：成功 → code=JY-YYYY-NN、running、承接方解析', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '测试共研项目',
        undertakers: [
          { type: 'enterprise', id: 'E2001', share: 60 },
          { type: 'individual', id: 'U1002', share: 40 },
        ],
        description: 'e2e 新增的项目',
        milestones: [{ name: '立项', date: '2026-10-01', owners: ['星澜智能科技'] }],
      })

    expect(res.status).toBe(201)
    expect(res.body.code).toBe(0)
    expect(res.body.data.code).toMatch(/^JY-\d{4}-\d{2}$/)
    expect(res.body.data.status).toBe('running')
    expect(res.body.data.progress).toBe(0)
    expect(res.body.data.memberCount).toBe(2)
    expect(res.body.data.undertakers).toHaveLength(2)
    expect(res.body.data.undertakers[0]).toMatchObject({ type: 'enterprise', id: 'E2001', name: '星澜智能科技' })
    expect(res.body.data.undertakers[1]).toMatchObject({ type: 'individual', id: 'U1002' })
    expect(res.body.data.milestones[0]).toMatchObject({ name: '立项', status: 'todo' })
  })

  it('pause → resume → close 状态链（P5001）', async () => {
    let res = await request(app.getHttpServer())
      .post('/api/admin/projects/P5001/pause')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ code: 0 })

    res = await request(app.getHttpServer()).get('/api/admin/projects/P5001').set('Authorization', `Bearer ${token}`)
    expect(res.body.data.status).toBe('paused')

    res = await request(app.getHttpServer())
      .post('/api/admin/projects/P5001/resume')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)

    res = await request(app.getHttpServer()).get('/api/admin/projects/P5001').set('Authorization', `Bearer ${token}`)
    expect(res.body.data.status).toBe('running')

    await request(app.getHttpServer()).post('/api/admin/projects/P5001/pause').set('Authorization', `Bearer ${token}`)
    res = await request(app.getHttpServer())
      .post('/api/admin/projects/P5001/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '项目目标达成，关闭' })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ code: 0 })

    res = await request(app.getHttpServer()).get('/api/admin/projects/P5001').set('Authorization', `Bearer ${token}`)
    expect(res.body.data.status).toBe('closed')
    expect(res.body.data.closeReason).toBe('项目目标达成，关闭')
  })

  it('close 缺 reason → 400（P5005 paused）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/projects/P5005/close')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '' })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('请填写关闭原因')
  })

  it('非法流转 → 409（resume 运行中的 P5002）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/projects/P5002/resume')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    expect(res.body.message).toBe('仅已暂停的项目可恢复')
  })

  it('项目合同附件 → 上传（图片/PDF）/列表/删除（仅限本项目名下附件）', async () => {
    /* 魔数嗅探通过的 PNG（仅校验文件头，内容无需真实可用） */
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('fake-project-contract'),
    ])
    const uploaded = await request(app.getHttpServer())
      .post('/api/admin/projects/P5002/contracts')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', png, '项目合同扫描件.png')
    expect(uploaded.status).toBe(200)
    expect(uploaded.body.data.mime).toBe('image/png')
    expect(uploaded.body.data.sourceType).toBe('project')
    expect(uploaded.body.data.sourceId).toBe('P5002')
    const assetId = uploaded.body.data.id as string

    /* PDF 扫描件同样允许（%PDF- 魔数） */
    const pdf = await request(app.getHttpServer())
      .post('/api/admin/projects/P5002/contracts')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.4 fake-contract'), '项目合同扫描件.pdf')
    expect(pdf.status).toBe(200)
    expect(pdf.body.data.mime).toBe('application/pdf')
    const pdfId = pdf.body.data.id as string

    const list = await request(app.getHttpServer())
      .get('/api/admin/projects/P5002/contracts')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.data.length).toBe(2)

    /* 不支持的文件类型（文本）→ 400 */
    const badType = await request(app.getHttpServer())
      .post('/api/admin/projects/P5002/contracts')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not-a-contract'), 'note.txt')
    expect(badType.status).toBe(400)
    expect(badType.body.message).toBe('不支持的文件类型')

    /* 跨项目删除 → 404（附件不属于该项目） */
    const cross = await request(app.getHttpServer())
      .delete(`/api/admin/projects/P5001/contracts/${assetId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(cross.status).toBe(404)

    /* 未知项目 → 404 */
    const unknown = await request(app.getHttpServer())
      .get('/api/admin/projects/P9999/contracts')
      .set('Authorization', `Bearer ${token}`)
    expect(unknown.status).toBe(404)

    for (const id of [assetId, pdfId]) {
      const removed = await request(app.getHttpServer())
        .delete(`/api/admin/projects/P5002/contracts/${id}`)
        .set('Authorization', `Bearer ${token}`)
      expect(removed.status).toBe(200)
      expect(removed.body.data).toEqual({ code: 0 })
    }
    const after = await request(app.getHttpServer())
      .get('/api/admin/projects/P5002/contracts')
      .set('Authorization', `Bearer ${token}`)
    expect(after.body.data.length).toBe(0)
  })

  it('进度节点验收：驳回原因校验 → 通过重算进度 + 审计 → 末节点自动结项发经验 → 重复/终态 409', async () => {
    const prisma = app.get(PrismaService)

    /* 新建项目：单承接方（U1002 持社区个体身份，可参与结项经验分配），两个节点 */
    const created = await request(app.getHttpServer())
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectName: '进度节点验收专项',
        undertakers: [{ type: 'individual', id: 'U1002', share: 100 }],
        description: '里程碑验收 e2e',
        milestones: [
          { name: '节点一', date: '2026-11-01', owners: [] },
          { name: '节点二', date: '2026-11-15', owners: [] },
        ],
        expReward: 60,
      })
    expect(created.status).toBe(201)
    const projectId = created.body.data.id as string
    /* 详情/新增响应必须下发里程碑 id（前端按 id 定位节点做验收） */
    const milestones = created.body.data.milestones as { id: string; name: string }[]
    expect(milestones[0].id).toMatch(/^\d+$/)
    const [first, second] = milestones

    const accept = (milestoneId: string) =>
      request(app.getHttpServer())
        .post(`/api/admin/projects/${projectId}/milestones/${milestoneId}/accept`)
        .set('Authorization', `Bearer ${token}`)
    const reject = (milestoneId: string, reason: string) =>
      request(app.getHttpServer())
        .post(`/api/admin/projects/${projectId}/milestones/${milestoneId}/return`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason })

    /* 未提交（todo）不可验收 / 驳回 */
    expect((await accept(first.id)).status).toBe(409)
    expect((await reject(first.id, '证据不足')).status).toBe(409)

    /* 驳回：原因必填（空白串 400），成功后落库并可重新提交 */
    await prisma.milestone.update({
      where: { id: Number(first.id) },
      data: { status: 'submitted', submitAt: '2026-07-16 09:00' },
    })
    expect((await reject(first.id, '   ')).status).toBe(400)
    const returned = await reject(first.id, '证据不足')
    expect(returned.status).toBe(200)
    expect(returned.body.data).toEqual({ code: 0 })
    const returnedRow = await prisma.milestone.findUniqueOrThrow({ where: { id: Number(first.id) } })
    expect(returnedRow.status).toBe('returned')
    expect(returnedRow.returnReason).toBe('证据不足')

    /* 通过：进度按已验收比例重算，且写入审计 */
    await prisma.milestone.update({ where: { id: Number(first.id) }, data: { status: 'submitted', returnReason: null } })
    const accepted = await accept(first.id)
    expect(accepted.status).toBe(200)
    expect(accepted.body.data).toEqual({ code: 0 })
    let project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(project.progress).toBe(50)
    expect(project.status).toBe('running')

    /* 重复验收：状态已变更 → 409（幂等守卫，不会二次发放） */
    expect((await accept(first.id)).status).toBe(409)

    expect(
      await prisma.auditLog.findFirst({ where: { action: '里程碑验收通过', target: { contains: projectId } } }),
    ).toBeTruthy()
    expect(await prisma.auditLog.findFirst({ where: { action: '里程碑驳回', detail: '证据不足' } })).toBeTruthy()

    /* 末节点通过 → 自动结项、进度 100、按承接占比发结项经验 */
    await prisma.milestone.update({
      where: { id: Number(second.id) },
      data: { status: 'submitted', submitAt: '2026-07-16 10:00' },
    })
    expect((await accept(second.id)).status).toBe(200)
    project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(project.status).toBe('finished')
    expect(project.progress).toBe(100)
    expect(project.finishedAt).toBeTruthy()
    const exp = await prisma.experienceRecord.findFirst({
      where: { targetType: 'individual', targetId: 'U1002', reason: '「进度节点验收专项」结项经验值' },
    })
    expect(exp?.delta).toBe(60)

    /* 终态项目（已结项）不再可操作里程碑 */
    expect((await accept(second.id)).status).toBe(409)

    /* 已归档项目对客户端/后台均不可见 → 404 */
    await prisma.project.update({ where: { id: projectId }, data: { deletedAt: '2026-07-17 09:00' } })
    expect((await reject(second.id, '测试')).status).toBe(404)
  })
})
