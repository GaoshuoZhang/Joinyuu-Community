import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { buildThemeZip } from './helpers/theme-zip'

describe('移动端主题完整生命周期', () => {
  let app: INestApplication
  let prisma: PrismaService
  let token: string
  let packageId: string
  const base = '/api/admin/system/mobile-themes'
  const post = (path: string) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`)
  const del = (path: string) => request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`)
  const current = () => request(app.getHttpServer()).get('/api/app/mobile-theme')
  beforeAll(async () => {
    reseed()
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = module.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    await prisma.mobileThemeState.upsert({ where: { id: 1 }, create: { id: 1 }, update: { activeId: null, previousId: null } })
    await prisma.mobileThemePreview.deleteMany()
    await prisma.mobileThemePackage.deleteMany()
    token = await loginAs(app)
  })
  afterAll(async () => { if (app) await app.close() })
  it('defaults to public UI and enforces authentication and RBAC', async () => {
    expect((await current()).body.data).toBeNull()
    expect((await request(app.getHttpServer()).get(base)).status).toBe(401)
    const operator = await loginAs(app, 'operator')
    expect((await request(app.getHttpServer()).get(base).set('Authorization', `Bearer ${operator}`)).status).toBe(403)
    expect((await request(app.getHttpServer()).delete(`${base}/nonexistent`).set('Authorization', `Bearer ${operator}`)).status).toBe(403)
    expect((await request(app.getHttpServer()).delete(`${base}/nonexistent`)).status).toBe(401)
  })
  it('rejects invalid uploads, installs without enabling, rejects duplicate upload', async () => {
    expect((await post(`${base}/upload`).attach('file', Buffer.from('bad zip'), 'bad.zip')).status).toBe(400)
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../../examples/mobile-theme/manifest.json'), 'utf8'))
    manifest.brand.logo = 'assets/logo.png'
    manifest.brand.logoDark = 'assets/logo-dark.png'
    manifest.brand.logoShape = 'wordmark'
    manifest.brand.headline = 'AI创业者的伟大航路'
    manifest.brand.highlight = '伟大航路'
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const bytes = buildThemeZip([['manifest.json', Buffer.from(JSON.stringify(manifest))], ['assets/logo.png', image], ['assets/logo-dark.png', image]])
    const uploaded = await post(`${base}/upload`).attach('file', bytes, 'demo-theme.zip')
    expect(uploaded.status).toBe(200)
    packageId = uploaded.body.data.id
    expect(packageId).toBeTruthy()
    expect((await current()).body.data).toBeNull()
    expect((await post(`${base}/upload`).attach('file', bytes, 'demo-theme.zip')).status).toBe(409)
  })
  it('previews with an expiring token and does not change active theme', async () => {
    const grant = await post(`${base}/${packageId}/preview`)
    expect(grant.status).toBe(200)
    const preview = await request(app.getHttpServer()).get('/api/app/mobile-theme').query({ preview: grant.body.data.token })
    expect(preview.status).toBe(200)
    expect(preview.body.data.id).toBe('example-community')
    expect(preview.body.data.brand.logoDark).toBe(`/api/public/mobile-themes/${packageId}/assets/logo-dark.png`)
    expect(preview.body.data.brand.highlight).toBe('伟大航路')
    expect(preview.headers['cache-control']).toBe('no-store')
    expect((await current()).body.data).toBeNull()
    await prisma.mobileThemePreview.updateMany({ data: { expiresAt: new Date(0) } })
    expect((await request(app.getHttpServer()).get('/api/app/mobile-theme').query({ preview: grant.body.data.token })).status).toBe(404)
    expect((await request(app.getHttpServer()).get('/api/app/mobile-theme').query({ preview: packageId })).status).toBe(404)
  })
  it('activates, resets, rolls back and records audit', async () => {
    expect((await post(`${base}/${packageId}/activate`)).status).toBe(200)
    expect((await current()).body.data.packageId).toBe(packageId)
    expect((await post(`${base}/reset`)).status).toBe(200)
    expect((await current()).body.data).toBeNull()
    expect((await post(`${base}/rollback`)).status).toBe(200)
    expect((await current()).body.data.packageId).toBe(packageId)
    expect(await prisma.auditLog.count({ where: { action: '上传移动端主题' } })).toBe(1)
    expect((await post(`${base}/nonexistent/activate`)).status).toBe(404)
    expect((await current()).body.data.packageId).toBe(packageId)
  })
  it('serves only existing validated theme assets', async () => {
    const asset = await request(app.getHttpServer()).get(`/api/public/mobile-themes/${packageId}/assets/logo.png`)
    expect(asset.status).toBe(200)
    expect(asset.headers['content-type']).toContain('image/png')
    expect(asset.headers['cache-control']).toContain('immutable')
    expect(asset.headers['x-content-type-options']).toBe('nosniff')
    expect((await request(app.getHttpServer()).get(`/api/public/mobile-themes/${packageId}/assets/missing.png`)).status).toBe(404)
    expect((await request(app.getHttpServer()).get(`/api/public/mobile-themes/${packageId}/assets/code.js`)).status).toBe(404)
  })
  it('protects the active theme, deletes inactive resources and grants, allows re-upload', async () => {
    expect((await del(`${base}/${packageId}`)).status).toBe(409)
    expect((await current()).body.data.packageId).toBe(packageId)
    const grant = (await post(`${base}/${packageId}/preview`)).body.data
    expect((await post(`${base}/reset`)).status).toBe(200)
    const row = await prisma.mobileThemePackage.findUniqueOrThrow({ where: { id: packageId } })
    expect((await del(`${base}/${packageId}`)).status).toBe(200)
    const list = await request(app.getHttpServer()).get(base).set('Authorization', `Bearer ${token}`)
    expect(list.body.data.packages).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: packageId })]))
    expect(list.body.data.previousId).toBeNull()
    expect((await request(app.getHttpServer()).get('/api/app/mobile-theme').query({ preview: grant.token })).status).toBe(404)
    expect((await request(app.getHttpServer()).get(`/api/public/mobile-themes/${packageId}/assets/logo.png`)).status).toBe(404)
    expect(await prisma.mobileThemePreview.count({ where: { packageId } })).toBe(0)
    const { StorageService } = await import('../src/common/storage/storage.service')
    for (const key of Object.values(row.assets as Record<string, string>)) expect(await app.get(StorageService).read(key)).toBeNull()
    expect((await post(`${base}/${packageId}/activate`)).status).toBe(404)
    expect((await del(`${base}/${packageId}`)).status).toBe(404)
    expect(await prisma.auditLog.count({ where: { action: '删除移动端主题' } })).toBe(1)
    const bytes = buildThemeZip([['manifest.json', Buffer.from(JSON.stringify(row.manifest))], ...Object.keys(row.assets as Record<string, string>).map((key): [string, Buffer] => [key, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')])])
    expect((await post(`${base}/upload`).attach('file', bytes, 'again.zip')).status).toBe(200)
  })
  it('serializes activate/delete and preview/delete without dangling active IDs or grants', async () => {
    for (let i = 0; i < 3; i++) {
      await post(`${base}/reset`)
      const bytes = buildThemeZip([['manifest.json', Buffer.from(JSON.stringify({ schemaVersion: 1, id: `race-${i}`, name: '并发测试主题', version: '1.0.0' }))]])
      const id = (await post(`${base}/upload`).attach('file', bytes, 'race.zip')).body.data.id
      const [activation, deletion] = await Promise.all([post(`${base}/${id}/activate`), del(`${base}/${id}`)])
      expect([activation.status, deletion.status]).toEqual(activation.status === 200 ? [200, 409] : [404, 200])
      if (activation.status === 200) {
        expect((await current()).body.data.packageId).toBe(id)
        await post(`${base}/reset`)
      } else expect((await current()).body.data).toBeNull()
      if (deletion.status !== 200) {
        const [preview, removed] = await Promise.all([post(`${base}/${id}/preview`), del(`${base}/${id}`)])
        expect(removed.status).toBe(200)
        expect([200, 404]).toContain(preview.status)
        expect(await prisma.mobileThemePreview.count({ where: { packageId: id } })).toBe(0)
      }
    }
  })

})
