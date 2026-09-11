/* M1.5 R2 管理员账号 e2e：
 * 覆盖：列表 / 新增 / 编辑（角色）/ 启停（含不可停用自身）/ 重置密码（旧密码失效）。
 * 前置：seed 内置 admin|operator|auditor|space-ops，密码 admin123。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs, loginRequest } from './helpers/login'

describe('M1.5 R2 管理员账号', () => {
  let app: INestApplication
  let token: string
  let createdId: number
  let initialPassword: string

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

  const auth = () => ({ Authorization: `Bearer ${token}` })

  it('列表：返回内置账号与角色码', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/admins')
      .set(auth())
    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(4)
    const admin = (res.body.data.list as Array<Record<string, unknown>>).find((a) => a.username === 'admin')
    expect(admin?.roleCodes).toEqual(['super'])
    expect(admin?.status).toBe('active')
  })

  it('新增：新增成功（随机初始密码）；重复账号 409；无效角色 400；弱初始密码 400', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/admin/admins')
      .set(auth())
      .send({ username: 'tester', name: '测试专员', roleCodes: ['auditor'] })
    expect(create.status).toBe(200)
    createdId = create.body.data.id as number
    expect(createdId).toBeGreaterThan(0)
    initialPassword = create.body.data.initialPassword as string
    expect(typeof initialPassword).toBe('string')
    expect(initialPassword.length).toBeGreaterThanOrEqual(8)
    expect(/[A-Za-z]/.test(initialPassword) && /\d/.test(initialPassword)).toBe(true)

    const dup = await request(app.getHttpServer())
      .post('/api/admin/admins')
      .set(auth())
      .send({ username: 'tester', name: '重复', roleCodes: ['auditor'] })
    expect(dup.status).toBe(409)
    expect(dup.body).toEqual({ code: 409, message: '该账号已存在' })

    const badRole = await request(app.getHttpServer())
      .post('/api/admin/admins')
      .set(auth())
      .send({ username: 'tester2', name: '无效角色', roleCodes: ['nope'] })
    expect(badRole.status).toBe(400)
    expect(badRole.body.message).toContain('存在无效角色')

    const weak = await request(app.getHttpServer())
      .post('/api/admin/admins')
      .set(auth())
      .send({ username: 'tester3', name: '弱密码', roleCodes: ['auditor'], password: 'short' })
    expect(weak.status).toBe(400)
    expect(weak.body.message).toContain('初始密码')
  })

  it('编辑：更新姓名与角色', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/admin/admins/${createdId}`)
      .set(auth())
      .send({ name: '测试专员（改）', roleCodes: ['operator'] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ code: 0, data: { code: 0 } })

    const list = await request(app.getHttpServer())
      .get('/api/admin/admins')
      .set(auth())
    const row = (list.body.data.list as Array<Record<string, unknown>>).find((a) => a.id === createdId)
    expect(row?.name).toBe('测试专员（改）')
    expect(row?.roleCodes).toEqual(['operator'])
  })

  it('重置密码：新密码可登录，初始密码失效', async () => {
    const first = await loginRequest(app, 'tester', initialPassword)
    expect(first.status).toBe(200)
    expect(first.body.data.token).toBeTruthy()

    const reset = await request(app.getHttpServer())
      .post(`/api/admin/admins/${createdId}/reset-password`)
      .set(auth())
      .send({ password: 'tester123' })
    expect(reset.status).toBe(200)

    const ok = await loginRequest(app, 'tester', 'tester123')
    expect(ok.status).toBe(200)
    expect(ok.body.data.token).toBeTruthy()

    const old = await loginRequest(app, 'tester', initialPassword)
    expect(old.status).toBe(401)
  })

  it('弱密码重置 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/admin/admins/${createdId}/reset-password`)
      .set(auth())
      .send({ password: 'short' })
    expect(res.status).toBe(400)
  })

  it('启停：停用后登录被拒；不可停用当前登录账号', async () => {
    const disable = await request(app.getHttpServer())
      .patch(`/api/admin/admins/${createdId}/status`)
      .set(auth())
      .send({ status: 'disabled' })
    expect(disable.status).toBe(200)

    const login = await loginRequest(app, 'tester', 'tester123')
    expect(login.status).toBe(401)
    expect(login.body.message).toBe('账号已停用，请联系超级管理员')

    const self = await request(app.getHttpServer())
      .get('/api/admin/admins')
      .set(auth())
    const adminId = (self.body.data.list as Array<{ id: number; username: string }>).find(
      (a) => a.username === 'admin',
    )?.id
    const selfDisable = await request(app.getHttpServer())
      .patch(`/api/admin/admins/${adminId}/status`)
      .set(auth())
      .send({ status: 'disabled' })
    expect(selfDisable.status).toBe(400)
    expect(selfDisable.body).toEqual({ code: 400, message: '不可停用当前登录账号' })
  })

  it('最后一名启用超管不可降权；停用自身被拦截', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/admin/admins')
      .set(auth())
    const adminRow = (list.body.data.list as Array<{ id: number; username: string }>).find(
      (a) => a.username === 'admin',
    )
    expect(adminRow).toBeTruthy()

    const demote = await request(app.getHttpServer())
      .put(`/api/admin/admins/${adminRow!.id}`)
      .set(auth())
      .send({ name: '社区管理员', roleCodes: ['operator'] })
    expect(demote.status).toBe(400)
    expect(demote.body.message).toContain('超级管理员')

    /* 停用自身由「不可停用当前登录账号」先行拦截（最后超管停用守卫面向其他账号场景） */
    const disable = await request(app.getHttpServer())
      .patch(`/api/admin/admins/${adminRow!.id}/status`)
      .set(auth())
      .send({ status: 'disabled' })
    expect(disable.status).toBe(400)
    expect(disable.body.message).toContain('不可停用当前登录账号')
  })
})
