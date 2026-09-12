/* M1.5 R1 RBAC e2e：
 * 覆盖：权限点目录、角色列表、无权限 403、有权限通过、改角色后即时生效（缓存失效）。
 * 前置：docker compose up + prisma migrate + seed（内置角色 R1~R4 / 账号 admin|operator|auditor|space-ops，密码 admin123）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs, loginRequest } from './helpers/login'

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

  it('新增角色：创建自定义角色（初始无权限点）并出现在列表', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'content_editor', name: '内容编辑', description: '仅内容管理域' })
    expect(res.status).toBe(200)
    expect(res.body.data.code).toBe('content_editor')
    expect(res.body.data.name).toBe('内容编辑')
    expect(res.body.data.permCodes).toEqual([])

    const list = await request(app.getHttpServer())
      .get('/api/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
    const created = (list.body.data as Array<{ code: string; permCodes: string[] }>).find(
      (r) => r.code === 'content_editor',
    )
    expect(created).toBeTruthy()
    expect(created?.permCodes).toEqual([])
  })

  it('新增角色：编码/名称重复 409，内置编码 400，非法编码格式 400', async () => {
    const base = { Authorization: `Bearer ${adminToken}` }

    const dupCode = await request(app.getHttpServer())
      .post('/api/admin/roles')
      .set(base)
      .send({ code: 'content_editor', name: '另一个角色' })
    expect(dupCode.status).toBe(409)
    expect(dupCode.body.message).toBe('该角色编码已存在')

    const dupName = await request(app.getHttpServer())
      .post('/api/admin/roles')
      .set(base)
      .send({ code: 'another_editor', name: '内容编辑' })
    expect(dupName.status).toBe(409)
    expect(dupName.body.message).toBe('该角色名称已存在')

    const reserved = await request(app.getHttpServer())
      .post('/api/admin/roles')
      .set(base)
      .send({ code: 'super', name: '超级管理员二号' })
    expect(reserved.status).toBe(400)
    expect(reserved.body.message).toBe('不可使用内置角色编码 super')

    const invalid = await request(app.getHttpServer())
      .post('/api/admin/roles')
      .set(base)
      .send({ code: 'Bad Code!', name: '非法编码' })
    expect(invalid.status).toBe(400)
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

  it('数据范围：登录响应含 dataScope；超管不可限制；域外 403、域内放行且即时生效', async () => {
    /* 登录响应含 dataScope 数组（超管为空数组 = 不限制） */
    const adminLogin = await loginRequest(app, 'admin')
    expect(adminLogin.status).toBe(200)
    expect(adminLogin.body.data.dataScope).toEqual([])

    /* 超管角色不可限制数据范围 */
    const superScope = await request(app.getHttpServer())
      .put('/api/admin/roles/R1/scope')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ dataScope: ['space'] })
    expect(superScope.status).toBe(400)
    expect(superScope.body.message).toBe('超级管理员角色不可限制数据范围')

    /* 找 operator 角色 id 并补充 /users、/workstations 权限（数据范围守卫在权限守卫之后） */
    const rolesRes = await request(app.getHttpServer())
      .get('/api/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(rolesRes.status).toBe(200)
    const operatorRole = (rolesRes.body.data as Array<{ id: string; code: string; permCodes: string[] }>).find(
      (r) => r.code === 'operator',
    )
    expect(operatorRole).toBeTruthy()
    const operatorPerms = [...new Set([...operatorRole!.permCodes, '/users', '/workstations'])]
    const grant = await request(app.getHttpServer())
      .put(`/api/admin/roles/${operatorRole!.id}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permCodes: operatorPerms })
    expect(grant.status).toBe(200)

    /* 设置数据范围仅 space */
    const scopeRes = await request(app.getHttpServer())
      .put(`/api/admin/roles/${operatorRole!.id}/scope`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ dataScope: ['space'] })
    expect(scopeRes.status).toBe(200)
    expect(scopeRes.body).toEqual({ code: 0, data: { code: 0 } })

    /* operator 重新登录后：members 域接口 403，space 域接口放行 */
    const operatorLogin = await loginRequest(app, 'operator')
    expect(operatorLogin.status).toBe(200)
    expect(operatorLogin.body.data.dataScope).toEqual(['space'])
    const operatorToken = operatorLogin.body.data.token as string

    const users = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${operatorToken}`)
    expect(users.status).toBe(403)
    expect(users.body.message).toBe('无权限访问该数据范围')

    const workstations = await request(app.getHttpServer())
      .get('/api/admin/workstations')
      .set('Authorization', `Bearer ${operatorToken}`)
    expect(workstations.status).toBe(200)

    /* 恢复数据范围（清理） */
    const restore = await request(app.getHttpServer())
      .put(`/api/admin/roles/${operatorRole!.id}/scope`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ dataScope: [] })
    expect(restore.status).toBe(200)
  })
})
