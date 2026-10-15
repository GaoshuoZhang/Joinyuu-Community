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
})
