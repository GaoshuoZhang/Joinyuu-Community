/* M2-R R1 验收：个人中心（/me 聚合、资料更新、积分流水、经验流水、改密、地址簿、注销冷静期与撤回）
 * 前置：docker compose up + prisma migrate + seed（用户统一密码 user123） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appLoginRequest, appPost, sendAppSmsCode } from './helpers/app-login'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { addDays, formatToday } from '../src/common/utils/time'

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

  it('POST /me/activation-dismissed 永久隐藏新手任务并按账号持久化（幂等）', async () => {
    const before = await appGet(app, token, '/api/app/me')
    expect(before.body.data.activationDismissed).toBe(false)

    const first = await appPost(app, token, '/api/app/me/activation-dismissed', {})
    expect(first.status).toBe(200)
    expect(first.body.code).toBe(0)

    const after = await appGet(app, token, '/api/app/me')
    expect(after.body.data.activationDismissed).toBe(true)

    /* 幂等：重复调用仍 200，状态保持 */
    const second = await appPost(app, token, '/api/app/me/activation-dismissed', {})
    expect(second.status).toBe(200)
    const again = await appGet(app, token, '/api/app/me')
    expect(again.body.data.activationDismissed).toBe(true)

    /* 不影响其他账号（换账号/换浏览器登录仍显示新手任务） */
    const other = await appLoginAs(app, '13801210002', 'user123')
    const otherMe = await appGet(app, other, '/api/app/me')
    expect(otherMe.body.data.activationDismissed).toBe(false)
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

  it('用户名 90 天仅可修改一次：冷却期拒绝并下发可修改时间，期满恢复', async () => {
    const prisma = app.get(PrismaService)
    const before = await appGet(app, token, '/api/app/me')
    expect(before.body.data.usernameChangeableAt).toBeNull()

    const first = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'chenyu_e2e_1' })
    expect(first.status).toBe(200)

    const locked = await appGet(app, token, '/api/app/me')
    expect(locked.body.data.username).toBe('chenyu_e2e_1')
    expect(typeof locked.body.data.usernameChangeableAt).toBe('string')

    /* 冷却期内再次改名拒绝；同值提交与其他字段更新不受影响 */
    const second = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'chenyu_e2e_2' })
    expect(second.status).toBe(400)
    expect(second.body.message).toContain('90 天')

    const profileOnly = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'chenyu_e2e_1', bio: '冷却期仍可改简介' })
    expect(profileOnly.status).toBe(200)
    expect((await appGet(app, token, '/api/app/me')).body.data.bio).toBe('冷却期仍可改简介')

    /* 回拨修改时间到 90 天前：冷却解除，可再次修改 */
    await prisma.user.update({
      where: { uid: 'U1001' },
      data: { usernameChangedAt: `${addDays(formatToday(), -91)} 00:00` },
    })
    const third = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'chenyu_e2e_3' })
    expect(third.status).toBe(200)
    const relocked = await appGet(app, token, '/api/app/me')
    expect(relocked.body.data.username).toBe('chenyu_e2e_3')
    /* 改名成功即重新进入冷却：下次可修改时间为新的 90 天后 */
    expect(typeof relocked.body.data.usernameChangeableAt).toBe('string')
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

  it('未设置密码账号（验证码建号）：首次设置免原密码，置为已设置后必须校验原密码', async () => {
    const phone = '13900005555'
    const code = await sendAppSmsCode(app, phone, 'login')
    const created = await request(app.getHttpServer())
      .post('/api/app/auth/login-by-code')
      .send({ channel: 'phone', account: phone, code, agreed: true })
    expect(created.status).toBe(200)
    expect(created.body.data.isNewUser).toBe(true)
    const freshToken = created.body.data.token as string

    /* 未设置密码（passwordHash 为空）：不传 oldPassword 直接设置 */
    const set = await appPost(app, freshToken, '/api/app/me/change-password', { newPassword: 'brandnew123' })
    expect(set.status).toBe(200)
    expect(set.body.code).toBe(0)

    /* 成功后台全端登出（与改密同口径） */
    expect((await appGet(app, freshToken, '/api/app/me')).status).toBe(401)

    const relogin = await appLoginRequest(app, phone, 'brandnew123')
    expect(relogin.status).toBe(200)
    const reloginToken = relogin.body.data.token as string
    expect((await appGet(app, reloginToken, '/api/app/me')).body.data.hasPassword).toBe(true)

    /* 已有密码后，改密必须带原密码（缺失 400，而不是 500） */
    const noOld = await appPost(app, reloginToken, '/api/app/me/change-password', { newPassword: 'another123' })
    expect(noOld.status).toBe(400)
    expect(noOld.body.message).toContain('请输入原密码')
  })

  it('地址簿已随统一券码兑换改造移除（/me/addresses 返回 404）', async () => {
    const list = await appGet(app, token, '/api/app/me/addresses')
    expect(list.status).toBe(404)
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
