/* M2-R R1 验收：个人中心（/me 聚合、资料更新、积分流水、经验流水、改密、地址簿、注销冷静期与撤回）
 * 前置：docker compose up + prisma migrate + seed（用户统一密码 user123） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appLoginRequest, appPost } from './helpers/app-login'

describe('M2-R R1 app 个人中心', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    token = await appLoginAs(app, '13801210001', 'user123') // 陈屿 U1001
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /me 返回资料 + 身份列表 + 积分余额', async () => {
    const res = await appGet(app, token, '/api/app/me')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    const me = res.body.data
    expect(me.uid).toBe('U1001')
    expect(me.nickname).toBe('陈屿')
    expect(typeof me.points).toBe('number')
    expect(Array.isArray(me.identities)).toBe(true)
    const types = me.identities.map((i: { type: string }) => i.type)
    expect(types).toContain('individual')
    expect(types).toContain('community_enterprise')
  })

  it('PUT /me 更新昵称与简介生效', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nickname: '陈屿（测试）',
        bio: '更新后的简介',
        gender: 'male',
        avatar: '/api/public/files/test/avatar.png',
      })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const me = await appGet(app, token, '/api/app/me')
    expect(me.body.data.nickname).toBe('陈屿（测试）')
    expect(me.body.data.bio).toBe('更新后的简介')
    expect(me.body.data.avatar).toBe('/api/public/files/test/avatar.png')
  })

  it('GET /me/points-records 分页返回积分流水', async () => {
    const res = await appGet(app, token, '/api/app/me/points-records?page=1&pageSize=5')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.list)).toBe(true)
    expect(typeof res.body.data.total).toBe('number')
    if (res.body.data.list.length > 0) {
      expect(typeof res.body.data.list[0].balance).toBe('number')
    }
  })

  it('GET /me/experience-records 默认个人维度（社区个体才有数据）', async () => {
    // U1001 无社区个体身份 → 空等级
    const res = await appGet(app, token, '/api/app/me/experience-records')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.level).toBeNull()
    expect(res.body.data.currentExperience).toBe(0)
    expect(res.body.data.currentLevelThreshold).toBe(0)
    expect(res.body.data.nextLevelThreshold).toBeNull()
    expect(Array.isArray(res.body.data.records)).toBe(true)
  })

  it('GET /me/experience-records 返回权威经验值与当前/下一等级门槛', async () => {
    const individual = await appLoginAs(app, '13801210005', 'user123')
    const res = await appGet(app, individual, '/api/app/me/experience-records')

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      identityLabel: '社区个体',
      level: 5,
      levelName: '领航',
      currentExperience: 1500,
      currentLevelThreshold: 1000,
      nextLevelThreshold: null,
    })
    expect(res.body.data.records.length).toBeGreaterThan(0)
  })

  it('改密：原密码错误 400，成功后自动退出登录（含当前会话）', async () => {
    const otherToken = await appLoginAs(app, '13801210001', 'user123')
    const wrong = await appPost(app, token, '/api/app/me/change-password', {
      oldPassword: 'bad-old',
      newPassword: 'newpass456',
    })
    expect(wrong.status).toBe(400)

    const ok = await appPost(app, token, '/api/app/me/change-password', {
      oldPassword: 'user123',
      newPassword: 'newpass456',
    })
    expect(ok.status).toBe(200)
    expect(ok.body.code).toBe(0)

    const oldPass = await appLoginRequest(app, '13801210001', 'user123')
    expect(oldPass.status).toBe(401)
    const newPass = await appLoginRequest(app, '13801210001', 'newpass456')
    expect(newPass.status).toBe(200)
    /* 需求：修改完密码自动退出登录——其他会话与当前会话一并失效 */
    const kicked = await appGet(app, otherToken, '/api/app/me')
    expect(kicked.status).toBe(401)
    const currentKicked = await appGet(app, token, '/api/app/me')
    expect(currentKicked.status).toBe(401)

    /* 用新密码重新登录，供后续用例继续使用 */
    token = newPass.body.data.token
  })

  it('地址簿：CRUD + 默认地址唯一 + 删除默认转移', async () => {
    const c1 = await appPost(app, token, '/api/app/me/addresses', {
      name: '陈屿',
      phone: '13801210001',
      region: '浙江省杭州市西湖区',
      detail: '文三路 90 号',
      isDefault: true,
    })
    expect(c1.status).toBe(200)
    const id1: string = c1.body.data.id

    const c2 = await appPost(app, token, '/api/app/me/addresses', {
      name: '陈屿',
      phone: '13801210001',
      region: '上海市浦东新区',
      detail: '张江高科苑 2 号',
      isDefault: true,
    })
    expect(c2.status).toBe(200)
    const id2: string = c2.body.data.id

    const list = await appGet(app, token, '/api/app/me/addresses')
    expect(list.body.code).toBe(0)
    const defaults = list.body.data.list.filter((a: { isDefault: boolean }) => a.isDefault)
    expect(defaults.length).toBe(1)
    expect(defaults[0].id).toBe(id2)

    // 删除默认地址 → 默认转移到剩余地址
    const del = await request(app.getHttpServer())
      .delete(`/api/app/me/addresses/${id2}`)
      .set('Authorization', `Bearer ${token}`)
    expect(del.status).toBe(200)
    const list2 = await appGet(app, token, '/api/app/me/addresses')
    const defaults2 = list2.body.data.list.filter((a: { isDefault: boolean }) => a.isDefault)
    expect(defaults2.length).toBe(1)
    expect(defaults2[0].id).toBe(id1)
  })

  it('注销：提交进入 7 天冷静期，冷静期内可撤回', async () => {
    const req = await appPost(app, token, '/api/app/me/deletion-request', { reason: '测试注销' })
    expect(req.status).toBe(200)
    expect(req.body.data.effectiveAt).toBeTruthy()

    // 重复提交 409
    const dup = await appPost(app, token, '/api/app/me/deletion-request', {})
    expect(dup.status).toBe(409)

    const cancel = await appPost(app, token, '/api/app/me/deletion-request/cancel', {})
    expect(cancel.status).toBe(200)
    expect(cancel.body.code).toBe(0)

    // 撤回后可再次提交
    const again = await appPost(app, token, '/api/app/me/deletion-request', {})
    expect(again.status).toBe(200)
  })

  it('个人数据导出生成可下载 JSON，并在账号申请状态中可见', async () => {
    const exported = await appPost(app, token, '/api/app/me/data-export', {})
    expect(exported.status).toBe(200)
    expect(exported.body.data.url).toMatch(/^\/api\/app\/me\/data-exports\/export-/)
    const file = await request(app.getHttpServer()).get(exported.body.data.url).set('Authorization', `Bearer ${token}`)
    expect(file.status).toBe(200)
    const requests = await appGet(app, token, '/api/app/me/account-requests')
    expect(requests.body.data.export.url).toBe(exported.body.data.url)
  })
})
