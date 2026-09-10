/* M1-D 规则验收（wiki-backend.md §7.11）：
 * 等级梯度整组保存校验（非递增 → 400 精确文案）+ 积分/经验规则编辑 + 发放记录过滤（source=rule）。
 * 前置：docker compose up + prisma migrate + seed（含 5 级等级梯度、8 条积分规则、5 条经验规则） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'

describe('M1-D rules 规则管理', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    const login = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })
    token = login.body.data.token
  })

  afterAll(async () => {
    await app.close()
  })

  it('等级梯度：门槛非递增 → 400 精确文案', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/admin/rules/levels')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tiers: [
          { level: 1, label: '青铜', threshold: 0 },
          { level: 2, label: '白银', threshold: 100 },
          { level: 3, label: '黄金', threshold: 100 },
        ],
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('门槛经验值必须逐级递增')
  })

  it('等级梯度：空标签 / 超 10 级 → 400', async () => {
    const emptyLabel = await request(app.getHttpServer())
      .put('/api/admin/rules/levels')
      .set('Authorization', `Bearer ${token}`)
      .send({ tiers: [{ level: 1, label: '  ', threshold: 0 }] })
    expect(emptyLabel.status).toBe(400)
    expect(emptyLabel.body.message).toBe('等级标签不能为空')

    const tooMany = await request(app.getHttpServer())
      .put('/api/admin/rules/levels')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tiers: Array.from({ length: 11 }, (_, i) => ({
          level: i + 1,
          label: `L${i + 1}`,
          threshold: i * 100,
        })),
      })
    expect(tooMany.status).toBe(400)
    expect(tooMany.body.message).toBe('等级最多 10 级')
  })

  it('等级梯度：整组保存成功 → 列表按 level 升序返回', async () => {
    const save = await request(app.getHttpServer())
      .put('/api/admin/rules/levels')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tiers: [
          { level: 1, label: '青铜', threshold: 0 },
          { level: 2, label: '白银', threshold: 120 },
          { level: 3, label: '黄金', threshold: 360 },
        ],
      })
    expect(save.status).toBe(200)
    expect(save.body.code).toBe(0)

    const list = await request(app.getHttpServer())
      .get('/api/admin/rules/levels')
      .set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(3)
    expect(list.body.data.map((t: { level: number }) => t.level)).toEqual([1, 2, 3])
    expect(list.body.data[0].label).toBe('青铜')
    expect(list.body.data[1].threshold).toBe(120)
  })

  it('积分规则：积分值非正整数 → 400 / 合法编辑 → 200', async () => {
    const invalid = await request(app.getHttpServer())
      .put('/api/admin/mall/points-rules/activity_checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ points: 0 })
    expect(invalid.status).toBe(400)
    expect(invalid.body.message).toBe('积分值必须为正整数')

    const valid = await request(app.getHttpServer())
      .put('/api/admin/mall/points-rules/activity_checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ points: 12 })
    expect(valid.status).toBe(200)
    expect(valid.body.code).toBe(0)

    const list = await request(app.getHttpServer())
      .get('/api/admin/mall/points-rules')
      .set('Authorization', `Bearer ${token}`)
    const rule = list.body.data.find((r: { code: string }) => r.code === 'activity_checkin')
    expect(rule.points).toBe(12)
  })

  it('经验值规则：经验值非正整数 → 400', async () => {
    const invalid = await request(app.getHttpServer())
      .put('/api/admin/rules/experience/activity_checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ exp: -1 })
    expect(invalid.status).toBe(400)
    expect(invalid.body.message).toBe('经验值必须为正整数')
  })

  it('发放记录：仅 source=rule', async () => {
    const points = await request(app.getHttpServer())
      .get('/api/admin/mall/points-issuance')
      .set('Authorization', `Bearer ${token}`)
    expect(points.status).toBe(200)
    expect(points.body.data.length).toBeGreaterThan(0)
    expect(points.body.data.every((r: { source: string }) => r.source === 'rule')).toBe(true)

    const exp = await request(app.getHttpServer())
      .get('/api/admin/rules/experience-issuance')
      .set('Authorization', `Bearer ${token}`)
    expect(exp.status).toBe(200)
    expect(exp.body.data.length).toBeGreaterThan(0)
    expect(exp.body.data.every((r: { source: string }) => r.source === 'rule')).toBe(true)
  })
})
