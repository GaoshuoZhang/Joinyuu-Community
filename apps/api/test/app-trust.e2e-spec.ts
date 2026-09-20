/* M2-R R3 验收：实名认证、收藏、协议版本下发、社区（政策/人才/企业库）
 * 前置：docker compose up + prisma migrate reset（全量迁移）+ seed；用户密码 user123 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost } from './helpers/app-login'

describe('M2-R R3 实名/收藏/协议/社区', () => {
  let app: INestApplication
  let prisma: PrismaService
  let token: string // U1001 陈屿（seed 已实名）
  let tokenU5: string // U1005 顾北辰（社区个体 + 已有名片）
  let tokenU15: string // U1015 许新言（未实名新用户）

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    token = await appLoginAs(app, '13801210001', 'user123')
    tokenU5 = await appLoginAs(app, '13801210005', 'user123')
    tokenU15 = await appLoginAs(app, '13801210015', 'user123')
  })

  afterAll(async () => {
    await app.close()
  })

  it('实名：默认未实名 → 非法身份证 400 → 合法提交成功 → 脱敏展示 → 重复提交 409', async () => {
    const before = await appGet(app, tokenU15, '/api/app/me/realname')
    expect(before.status).toBe(200)
    expect(before.body.data.verified).toBe(false)

    const bad = await request(app.getHttpServer())
      .put('/api/app/me/realname')
      .set('Authorization', `Bearer ${tokenU15}`)
      .send({ realName: '许新言', citizenId: '330106199001011234' })
    expect(bad.status).toBe(400)

    // 合法校验码身份证（33010619900101123X 按加权算法验证）
    const ok = await request(app.getHttpServer())
      .put('/api/app/me/realname')
      .set('Authorization', `Bearer ${tokenU15}`)
      .send({ realName: '许新言', citizenId: '33010619900101123X' })
    // 若校验码不匹配则改用程序计算的合法号码再试（保持套件稳定）
    if (ok.status === 400) {
      const factors = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
      const map = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
      const base = '33010619900101123'
      let sum = 0
      for (let i = 0; i < 17; i++) sum += Number(base[i]) * factors[i]
      const valid = base + map[sum % 11]
      const retry = await request(app.getHttpServer())
        .put('/api/app/me/realname')
        .set('Authorization', `Bearer ${tokenU15}`)
        .send({ realName: '许新言', citizenId: valid })
      expect(retry.status).toBe(200)
    } else {
      expect(ok.status).toBe(200)
    }

    const after = await appGet(app, tokenU15, '/api/app/me/realname')
    expect(after.body.data.verified).toBe(true)
    expect(after.body.data.realName).toContain('*')
    expect(after.body.data.citizenIdMasked).toMatch(/^\d{4}\*{10}\d{3}[\dX]$/)

    const dup = await request(app.getHttpServer())
      .put('/api/app/me/realname')
      .set('Authorization', `Bearer ${tokenU15}`)
      .send({ realName: '许新言', citizenId: '33010619900101123X' })
    expect(dup.status).toBe(409)
  })

  it('实名分级权益下发且 active 与实名状态一致', async () => {
    const res = await appGet(app, token, '/api/app/me/realname-rights')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    const activeTiers = res.body.data.filter((b: { active: boolean }) => b.active)
    expect(activeTiers.length).toBe(1)
  })

  it('实名强制开关打开后，未实名用户发布需求被 403 拦截', async () => {
    // 临时清空 U1005 实名信息以验证强制拦截（U1001 等多数 seed 用户已实名）
    await prisma.user.update({ where: { uid: 'U1005' }, data: { realName: null, citizenId: null } })
    await prisma.systemConfig.update({ where: { id: 1 }, data: { realnameRequired: true } })
    const res = await appPost(app, tokenU5, '/api/app/demands', {
      title: 'R3 实名拦截测试',
      description: '未实名应被拦截',
      categoryCode: 'DC001',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'community_individual',
      contactName: '顾北辰',
      contactPhone: '13801210005',
      deliverable: '两周内交付高保真原型',
      deliverBy: '2026-10-30',
    })
    expect(res.status).toBe(403)
    // 关闭开关恢复放行
    await prisma.systemConfig.update({ where: { id: 1 }, data: { realnameRequired: false } })
    const ok = await appPost(app, tokenU5, '/api/app/demands', {
      title: 'R3 实名放行测试',
      description: '开关关闭应放行',
      categoryCode: 'DC001',
      categoryDict: 'demand_category',
      kind: 'task',
      asIdentity: 'community_individual',
      contactName: '顾北辰',
      contactPhone: '13801210005',
      deliverable: '两周内交付高保真原型',
      deliverBy: '2026-10-30',
    })
    expect(ok.status).toBe(200)
    // 恢复 U1005 实名信息
    await prisma.user.update({ where: { uid: 'U1005' }, data: { realName: '顾北辰', citizenId: '1101011990011018515X' } })
  })

  it('收藏：toggle 幂等 + 列表含服务端快照 + 类型筛选', async () => {
    const on = await appPost(app, token, '/api/app/me/favorites/toggle', {
      type: 'demand',
      targetId: 'D4001',
      title: 'FPC 供应商推荐',
      subtitle: '芯启半导体',
    })
    expect(on.status).toBe(200)
    expect(on.body.data.favorited).toBe(true)

    const list = await appGet(app, token, '/api/app/me/favorites')
    const row = list.body.data.find((f: { targetId: string }) => f.targetId === 'D4001')
    expect(row).toBeTruthy()
    // R3 复查：标题快照由服务端从真实目标生成，忽略客户端传值
    expect(row.title).toBe('寻找柔性电路板打样供应商')

    const byType = await appGet(app, token, '/api/app/me/favorites?type=demand')
    expect(byType.body.data.every((f: { type: string }) => f.type === 'demand')).toBe(true)

    const off = await appPost(app, token, '/api/app/me/favorites/toggle', {
      type: 'demand',
      targetId: 'D4001',
      title: 'FPC 供应商推荐',
    })
    expect(off.body.data.favorited).toBe(false)
  })

  it('协议版本化：@Public 下发最新版本', async () => {
    const agreement = await request(app.getHttpServer()).get('/api/app/policies/user_agreement')
    expect(agreement.status).toBe(200)
    expect(agreement.body.data.version).toBe('1.0')
    expect(agreement.body.data.content).toContain('聚屿社区')

    const privacy = await request(app.getHttpServer()).get('/api/app/policies/privacy_policy')
    expect(privacy.status).toBe(200)
    expect(privacy.body.data.title).toContain('隐私')

    const missing = await request(app.getHttpServer()).get('/api/app/policies/unknown_kind')
    expect(missing.status).toBe(404)
  })

  it('社区：政策列表 + 人才库 + 人才名片隐私过滤 + 企业库', async () => {
    const policies = await appGet(app, token, '/api/app/community/policies')
    expect(policies.status).toBe(200)
    expect(policies.body.data.length).toBeGreaterThanOrEqual(3)
    expect(policies.body.data[0].category).toBeTruthy()

    const byCat = await appGet(app, token, '/api/app/community/policies?category=人才政策')
    expect(byCat.body.data.every((p: { category: string }) => p.category === '人才政策')).toBe(true)

    const talents = await appGet(app, token, '/api/app/community/talents')
    expect(talents.status).toBe(200)
    expect(talents.body.data.length).toBeGreaterThanOrEqual(2)
    const gu = talents.body.data.find((t: { uid: string }) => t.uid === 'U1005')
    expect(gu).toBeTruthy()

    const card = await appGet(app, token, `/api/app/community/talents/U1005`)
    expect(card.status).toBe(200)
    expect(card.body.data.name).toBe('顾北辰')
    expect(card.body.data.education.length).toBeGreaterThan(0)
    expect(card.body.data.visibility).toBeUndefined()

    // 隐私开关关闭 age 后不再下发
    await prisma.individualCard.update({
      where: { userId: 'U1005' },
      data: { visibility: { age: false, politicalStatus: true } },
    })
    const card2 = await appGet(app, token, `/api/app/community/talents/U1005`)
    expect(card2.body.data.age).toBeUndefined()
    await prisma.individualCard.update({
      where: { userId: 'U1005' },
      data: { visibility: { age: true, politicalStatus: true } },
    })

    // 无名片用户 404
    const noCard = await appGet(app, token, `/api/app/community/talents/U1006`)
    expect(noCard.status).toBe(404)

    const ents = await appGet(app, token, '/api/app/community/enterprises')
    expect(ents.status).toBe(200)
    const xinglan = ents.body.data.find((e: { id: string }) => e.id === 'E2001')
    expect(xinglan.website).toBeTruthy()
  })

  it('U1005 个人名片 PUT 保存即公开', async () => {
    const put = await request(app.getHttpServer())
      .put('/api/app/me/cards/individual')
      .set('Authorization', `Bearer ${tokenU5}`)
      .send({
        intro: '更新后的个人简介',
        skills: ['品牌视觉', '新技能'],
        visibility: { age: true, politicalStatus: false },
      })
    expect(put.status).toBe(200)

    const cards = await appGet(app, tokenU5, '/api/app/me/cards')
    expect(cards.body.data.individual.intro).toBe('更新后的个人简介')
    expect(cards.body.data.individual.politicalStatus).toBe('群众') // 省略字段保留既有内容

    const card = await appGet(app, token, `/api/app/community/talents/U1005`)
    expect(card.body.data.intro).toBe('更新后的个人简介')
  })
})
