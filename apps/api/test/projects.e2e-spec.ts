/* M1-C 项目域验收（wiki-backend.md §13 M1-C）：
 * 新增（share 合计 != 100 → 400；成功 → code=JY-YYYY-NN）+ 暂停/恢复/关闭状态机链
 * + 关闭缺 reason → 400 + 非法流转 → 409。
 * 前置：docker compose up + prisma migrate + seed（P5001 running / P5005 paused / P5002 running、
 *       E2001 星澜智能科技 / U1002 持 community_individual 身份、ExperienceRule project_completed enabled） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
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
})
