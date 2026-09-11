/* M1.5 R1 RBAC e2e：
 * 覆盖：权限点目录、角色列表、无权限 403、有权限通过、改角色后即时生效（缓存失效）。
 * 前置：docker compose up + prisma migrate + seed（内置角色 R1~R4 / 账号 admin|operator|auditor|space-ops，密码 admin123）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1.5 R1 RBAC（角色/权限）', () => {
  let app: INestApplication
  let adminToken: string
  let auditorToken: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    adminToken = await loginAs(app, 'admin')
    auditorToken = await loginAs(app, 'auditor')
  })

  afterAll(async () => {
    await app.close()
  })

  it('权限点目录：按模块分组返回菜单与按钮权限码', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/permissions/catalog')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    const allCodes = (res.body.data as Array<{ perms: { code: string }[] }>).flatMap((g) =>
      g.perms.map((p) => p.code),
    )
    expect(allCodes).toContain('/system/roles')
    expect(allCodes).toContain('/system/admins')
    expect(allCodes).toContain('/system/trash')
    expect(allCodes.some((c) => c.startsWith('perm:'))).toBe(true)
  })

  it('角色列表：返回内置角色与权限码集合（超级管理员为 *）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    const roles = res.body.data as Array<{ code: string; permCodes: string[] }>
    expect(roles.length).toBe(4)
    const superRole = roles.find((r) => r.code === 'super')
    expect(superRole?.permCodes).toEqual(['*'])
    const auditor = roles.find((r) => r.code === 'auditor')
    expect(auditor?.permCodes).toContain('/logs/audit')
  })

  it('无权限访问受限接口 → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/admins')
      .set('Authorization', `Bearer ${auditorToken}`)
    expect(res.status).toBe(403)
  })

  it('超级管理员有权限通过受限接口', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/admins')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.list.length).toBeGreaterThan(0)
  })

  it('改角色权限后即时生效（无需重新登录）', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/admin/admins')
      .set('Authorization', `Bearer ${auditorToken}`)
    expect(before.status).toBe(403)

    const grant = await request(app.getHttpServer())
      .put('/api/admin/roles/R3/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permCodes: ['/dashboard', '/logs/audit', '/system/admins'] })
    expect(grant.status).toBe(200)
    expect(grant.body).toEqual({ code: 0, data: { code: 0 } })

    const after = await request(app.getHttpServer())
      .get('/api/admin/admins')
      .set('Authorization', `Bearer ${auditorToken}`)
    expect(after.status).toBe(200)
  })

  it('无效权限码 → 400', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/admin/roles/R3/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permCodes: ['/not-exist'] })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('存在无效权限码')
  })

  it('超级管理员角色必须保留全量权限（*）', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/admin/roles/R1/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permCodes: ['/dashboard'] })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('全量权限')

    const keep = await request(app.getHttpServer())
      .put('/api/admin/roles/R1/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permCodes: ['*'] })
    expect(keep.status).toBe(200)
  })
})
