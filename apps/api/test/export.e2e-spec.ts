/* M1.5 R9 导出与打印 e2e：
 * 覆盖：CSV 导出（BOM + 表头 + 行数，域 users/demands/audit-logs）、未知域 404、
 *       租约打印单与审核单打印数据（复用详情，无新表）。
 * 前置：seed。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1.5 R9 导出与打印', () => {
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

  const auth = () => ({ Authorization: `Bearer ${token}` })

  it('导出用户 CSV：UTF-8 BOM + 表头 + 附件头', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/export/users')
      .set(auth())
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.text.charCodeAt(0)).toBe(0xfeff)

    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines[0]).toContain('UID')
    expect(lines[0]).toContain('昵称')
    expect(lines.length).toBeGreaterThan(1)
  })

  it('导出需求 CSV：status 过滤生效', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/export/demands')
      .set(auth())
      .query({ status: 'published' })
    expect(res.status).toBe(200)
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines[0]).toContain('需求编号')
    expect(lines.length).toBeGreaterThan(1)
  })

  it('导出审计日志 CSV；未知域 404', async () => {
    const logs = await request(app.getHttpServer())
      .get('/api/admin/export/audit-logs')
      .set(auth())
    expect(logs.status).toBe(200)
    expect(logs.text.replace(/^\uFEFF/, '').split('\r\n')[0]).toContain('操作人')

    const unknown = await request(app.getHttpServer())
      .get('/api/admin/export/not-exist')
      .set(auth())
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ code: 404, message: '不支持的导出域' })
  })

  it('租约打印单：返回结构化数据', async () => {
    const leases = await request(app.getHttpServer())
      .get('/api/admin/workstation-leases')
      .set(auth())
    const id = (leases.body.data as Array<{ id: string }>)[0].id

    const res = await request(app.getHttpServer())
      .get(`/api/admin/leases/${id}/print`)
      .set(auth())
    expect(res.status).toBe(200)
    expect(res.body.data.title).toContain('办公位租约确认单')
    expect(res.body.data.lease.id).toBe(id)
    expect(Array.isArray(res.body.data.clauses)).toBe(true)

    const missing = await request(app.getHttpServer())
      .get('/api/admin/leases/LS9999/print')
      .set(auth())
    expect(missing.status).toBe(404)
    expect(missing.body).toEqual({ code: 404, message: '租约不存在' })
  })

  it('审核单打印：返回结构化数据', async () => {
    const apps = await request(app.getHttpServer())
      .get('/api/admin/applications')
      .set(auth())
      .query({ page: 1, pageSize: 5 })
    const id = (apps.body.data.list as Array<{ id: string }>)[0].id

    const res = await request(app.getHttpServer())
      .get(`/api/admin/applications/${id}/print`)
      .set(auth())
    expect(res.status).toBe(200)
    expect(res.body.data.title).toContain('审核单')
    expect(res.body.data.application.id).toBe(id)
  })
})
