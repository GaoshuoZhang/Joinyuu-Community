/* M1-E 系统管理域 e2e（wiki-backend.md §13 M1-E / §7.15 / §7.16）：
 * 覆盖：通知中心（最新在前 / 单条已读 / 全部已读）、操作日志（module 筛选 + keyword 跨字段）、
 * 数据字典（列表 / 新增 / label 全类型唯一 409 / 启停 / 删除重排 sort / 编码取最小未占用序号），
 * 系统配置（读写 + 校验文案）、工作台聚合（dashboard + todos）。
 * 前置：docker compose up + prisma migrate + seed（N9001+ 通知 / AL1001+ 审计 / 三类字典 / 单例配置）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1-E system 系统管理域', () => {
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

  /* supertest：需先选 HTTP 方法再 .set（request(server) 本身无 .set） */
  const get = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`)
  const post = (path: string) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`)
  const put = (path: string) => request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${token}`)
  const del = (path: string) => request(app.getHttpServer()).delete(path).set('Authorization', `Bearer ${token}`)

  it('通知中心：最新在前，单条已读 / 全部已读', async () => {
    const list = await get('/api/admin/notifications')
    expect(list.status).toBe(200)
    const items = list.body.data as Array<{ id: string; read: boolean; at: string }>
    expect(items.length).toBeGreaterThan(0)
    /* 种子最新一条为 N9001（2026-09-07 14:08） */
    expect(items[0].id).toBe('N9001')
    /* 时间倒序 */
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].at >= items[i].at).toBe(true)
    }

    const target = items.find((n) => !n.read)!
    expect(target).toBeTruthy()
    const read = await post(`/api/admin/notifications/${target.id}/read`)
    expect(read.status).toBe(200)
    expect(read.body).toEqual({ code: 0, data: { code: 0 } })

    const afterRead = await get('/api/admin/notifications')
    expect(afterRead.body.data.find((n: { id: string }) => n.id === target.id).read).toBe(true)

    const readAll = await post('/api/admin/notifications/read-all')
    expect(readAll.status).toBe(200)
    const afterAll = await get('/api/admin/notifications')
    expect(afterAll.body.data.every((n: { read: boolean }) => n.read)).toBe(true)

    /* 不存在的 id 幂等返回（M0 口径） */
    const missing = await post('/api/admin/notifications/N9999/read')
    expect(missing.status).toBe(200)
    expect(missing.body).toEqual({ code: 0, data: { code: 0 } })
  })

  it('操作日志：分页 + module 精确筛选 + keyword 跨字段模糊', async () => {
    const all = await get('/api/admin/audit-logs').query({ page: 1, pageSize: 50 })
    expect(all.status).toBe(200)
    expect(all.body.data.total).toBeGreaterThan(0)
    /* 最新在前（种子最新为 AL1005，2026-09-06 17:12） */
    expect(all.body.data.list[0].id).toBe('AL1005')

    const byModule = await get('/api/admin/audit-logs').query({ page: 1, pageSize: 50, module: '系统管理' })
    expect(byModule.status).toBe(200)
    expect(byModule.body.data.total).toBe(2) /* AL1001 系统初始化 / AL1002 保存等级梯度 */
    expect(byModule.body.data.list.every((l: { module: string }) => l.module === '系统管理')).toBe(true)

    const byKeyword = await get('/api/admin/audit-logs').query({ page: 1, pageSize: 50, keyword: '冻结账号' })
    expect(byKeyword.status).toBe(200)
    expect(byKeyword.body.data.total).toBe(1)
    expect(byKeyword.body.data.list[0].id).toBe('AL1004')
  })

  it('数据字典：列表按 sort 升序（管理页返回全量）', async () => {
    const res = await get('/api/admin/dicts/demand_category')
    expect(res.status).toBe(200)
    const entries = res.body.data as Array<{ code: string; sort: number; status: string }>
    expect(entries.length).toBe(6)
    expect(entries[0].code).toBe('DC001')
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].sort).toBeGreaterThan(entries[i - 1].sort)
    }

    const industry = await get('/api/admin/dicts/industry')
    expect(industry.status).toBe(200)
    expect(industry.body.data.length).toBe(11)

    const badType = await get('/api/admin/dicts/unknown_type')
    expect(badType.status).toBe(400)
    expect(badType.body).toEqual({ code: 400, message: '字典类型不存在' })
  })

  it('数据字典：新增（全类型唯一）/ 启停 / 删除重排 sort', async () => {
    const created = await post('/api/admin/dicts/demand_category').send({ label: '测试类别X' })
    expect(created.status).toBe(200)
    expect(created.body.data.code).toBe('DC007')
    expect(created.body.data.sort).toBe(7)
    expect(created.body.data.status).toBe('enabled')

    /* label 全类型唯一（跨字典类型） */
    const dupSame = await post('/api/admin/dicts/demand_category').send({ label: '测试类别X' })
    expect(dupSame.status).toBe(409)
    expect(dupSame.body).toEqual({ code: 409, message: '字典项名称已存在' })
    const dupCross = await post('/api/admin/dicts/industry').send({ label: '测试类别X' })
    expect(dupCross.status).toBe(409)

    /* 空名称 */
    const empty = await post('/api/admin/dicts/demand_category').send({ label: '   ' })
    expect(empty.status).toBe(400)
    expect(empty.body).toEqual({ code: 400, message: '请输入字典项名称' })

    /* 启停 */
    const toggle = await post('/api/admin/dicts/demand_category/DC001/toggle-status')
    expect(toggle.status).toBe(200)
    const afterToggle = await get('/api/admin/dicts/demand_category')
    expect(afterToggle.body.data.find((e: { code: string }) => e.code === 'DC001').status).toBe('disabled')

    /* 不存在 */
    const notFound = await post('/api/admin/dicts/demand_category/DC999/toggle-status')
    expect(notFound.status).toBe(404)
    expect(notFound.body).toEqual({ code: 404, message: '字典项不存在' })

    /* 删除后重排 sort（删除 DC007 后应回到 1..6 连续） */
    const remove = await del('/api/admin/dicts/demand_category/DC007')
    expect(remove.status).toBe(200)
    expect(remove.body).toEqual({ code: 0, data: { code: 0 } })
    const afterDel = await get('/api/admin/dicts/demand_category')
    expect(afterDel.body.data.length).toBe(6)
    expect(afterDel.body.data.map((e: { sort: number }) => e.sort)).toEqual([1, 2, 3, 4, 5, 6])

    const delMissing = await del('/api/admin/dicts/demand_category/DC007')
    expect(delMissing.status).toBe(404)
    expect(delMissing.body).toEqual({ code: 404, message: '字典项不存在' })

    /* 商品类型：编码取最小未占用序号（GC001/GC003 → 补 GC002），新增后 sort 连续且不重复 */
    const goodsCreated = await post('/api/admin/dicts/goods_category').send({ label: '测试商品类型X' })
    expect(goodsCreated.status).toBe(200)
    expect(goodsCreated.body.data.code).toBe('GC002')
    const afterGoodsCreate = await get('/api/admin/dicts/goods_category')
    expect(afterGoodsCreate.body.data.map((e: { sort: number }) => e.sort)).toEqual([1, 2, 3])
    const goodsRestored = await del('/api/admin/dicts/goods_category/GC002')
    expect(goodsRestored.status).toBe(200)
    const afterGoodsDel = await get('/api/admin/dicts/goods_category')
    expect(afterGoodsDel.body.data.map((e: { sort: number }) => e.sort)).toEqual([1, 2])
  })

  it('工作台聚合：stats 计数 + 七域待办 + 待办审核前 5 + 近期活动前 4', async () => {
    const [dashboard, todos, users, enterprises, projects] = await Promise.all([
      get('/api/admin/dashboard'),
      get('/api/admin/todos'),
      get('/api/admin/users').query({ page: 1, pageSize: 1 }),
      get('/api/admin/enterprises').query({ page: 1, pageSize: 1, status: 'active' }),
      get('/api/admin/projects').query({ page: 1, pageSize: 1, status: 'running' }),
    ])
    expect(dashboard.status).toBe(200)
    const data = dashboard.body.data

    /* stats 与各域列表口径一致 */
    expect(data.stats.totalUsers).toBe(users.body.data.total)
    expect(data.stats.activeEnterprises).toBe(enterprises.body.data.total)
    expect(data.stats.runningProjects).toBe(projects.body.data.total)
    expect(typeof data.stats.pendingApplications).toBe('number')
    expect(typeof data.stats.upcomingEvents).toBe('number')

    /* 待办审核前 5 */
    expect(Array.isArray(data.pendingApplications)).toBe(true)
    expect(data.pendingApplications.length).toBeLessThanOrEqual(5)

    /* 近期活动前 4，含内嵌 enrollments（工作台展示报名数） */
    expect(Array.isArray(data.upcomingEvents)).toBe(true)
    expect(data.upcomingEvents.length).toBeLessThanOrEqual(4)
    if (data.upcomingEvents.length > 0) {
      expect(Array.isArray(data.upcomingEvents[0].enrollments)).toBe(true)
    }

    /* 七域待办（dashboard 内嵌与 /todos 一致）：响应审核排在需求审核之后 */
    expect(todos.status).toBe(200)
    const keys = (todos.body.data as Array<{ key: string }>).map((t) => t.key)
    expect(keys).toEqual(['settle', 'demand', 'demandResponse', 'reservation', 'article', 'eventEnrollment', 'lease'])
    expect(data.todos.map((t: { key: string }) => t.key)).toEqual(keys)
    expect(data.todos.every((t: { count: number }) => typeof t.count === 'number')).toBe(true)

    /* 文章待办路由指向投稿内容（M1.5 内容改造：/contents → /contents/submissions） */
    const articleTodo = (todos.body.data as Array<{ key: string; route: string }>).find(
      (t) => t.key === 'article',
    )
    expect(articleTodo?.route).toBe('/contents/submissions')
  })

  it('系统配置：读取 + 保存即生效 + 校验文案（M0 逐字）', async () => {
    const current = await get('/api/admin/system/config')
    expect(current.status).toBe(200)
    expect(current.body.data.siteName).toBe('聚屿社区')
    expect(current.body.data.mobileUrl).toBe('localhost:7759')
    expect(current.body.data.leaseExpireRemindDays).toBe(15)
    /* P0 密钥安全：仍返回 MinIO 配置，但 SecretKey 只给「是否已配置 + 脱敏值」，不回传原文 */
    expect(current.body.data.minioEnabled).toBe(false)
    expect(current.body.data.minioEndpoint).toBe('')
    expect(current.body.data.minioPort).toBe(9000)
    expect(current.body.data.minioUseSsl).toBe(false)
    expect(current.body.data.minioAccessKey).toBe('')
    expect(current.body.data.minioSecretKey).toBeUndefined()
    expect(current.body.data.minioSecretKeyConfigured).toBe(false)
    expect(current.body.data.minioSecretKeyMasked).toBe('')
    expect(current.body.data.minioCredentialSource).toBe('none')
    expect(current.body.data.minioBucket).toBe('joinyuu')

    const saved = await put('/api/admin/system/config').send({
      siteName: '聚屿社区（测试）',
      siteSlogan: '让每一座创业孤岛，在这里连成群岛。',
      registrationOpen: true,
      mallOpen: false,
      demandOpen: true,
      reservationOpen: true,
      realnameRequired: false,
      homeCarouselOpen: true,
      leaseExpireRemindDays: 20,
      uploadMaxSizeMb: 30,
      /* 密码过期强制改密开关（含周期）+ 存量字段全量提交 */
      passwordExpireEnabled: true,
      passwordExpireDays: 120,
      minioEnabled: false,
      minioEndpoint: 'minio.local',
      minioPort: 9001,
      minioUseSsl: true,
      minioAccessKey: 'joinyuu',
      minioSecretKey: 'joinyuu-secret',
      minioBucket: 'joinyuu-media',
    })
    expect(saved.status).toBe(200)
    expect(saved.body).toEqual({ code: 0, data: { code: 0 } })

    const after = await get('/api/admin/system/config')
    expect(after.body.data.siteName).toBe('聚屿社区（测试）')
    expect(after.body.data.mallOpen).toBe(false)
    expect(after.body.data.homeCarouselOpen).toBe(true)
    expect(after.body.data.leaseExpireRemindDays).toBe(20)
    expect(after.body.data.uploadMaxSizeMb).toBe(30)
    /* 默认关闭的开关：本次显式开启并保存后回读为 true */
    expect(after.body.data.passwordExpireEnabled).toBe(true)
    expect(after.body.data.passwordExpireDays).toBe(120)
    expect(after.body.data.minioEnabled).toBe(false)
    expect(after.body.data.minioEndpoint).toBe('minio.local')
    expect(after.body.data.minioPort).toBe(9001)
    expect(after.body.data.minioUseSsl).toBe(true)
    expect(after.body.data.minioAccessKey).toBe('joinyuu')
    expect(after.body.data.minioSecretKey).toBeUndefined()
    expect(after.body.data.minioSecretKeyConfigured).toBe(true)
    expect(after.body.data.minioSecretKeyMasked).toBe('********')
    expect(after.body.data.minioCredentialSource).toBe('database')
    expect(after.body.data.minioBucket).toBe('joinyuu-media')
    expect(after.body.data.updatedBy).toBe('社区管理员')

    /* 保存留痕（系统管理，含 MinIO 状态） */
    const logs = await get('/api/admin/audit-logs').query({ page: 1, pageSize: 50, keyword: '保存系统配置' })
    expect(logs.body.data.total).toBe(1)
    expect(logs.body.data.list[0].detail).toBe('临期提醒 20 天 · 上传上限 30 MB · MinIO 已停用 · 密码过期强制改密 已启用（120 天）')

    const emptyName = await put('/api/admin/system/config').send({
      siteName: '   ',
      siteSlogan: '',
      registrationOpen: true,
      mallOpen: true,
      demandOpen: true,
      reservationOpen: true,
      realnameRequired: false,
      homeCarouselOpen: true,
      leaseExpireRemindDays: 15,
      uploadMaxSizeMb: 10,
      passwordExpireDays: 90,
      minioEnabled: false,
      minioEndpoint: '',
      minioPort: 9000,
      minioUseSsl: false,
      minioAccessKey: '',
      minioSecretKey: '',
      minioBucket: 'joinyuu',
    })
    expect(emptyName.status).toBe(400)
    expect(emptyName.body).toEqual({ code: 400, message: '站点名称不能为空' })

    const badWindow = await put('/api/admin/system/config').send({
      siteName: '聚屿社区',
      siteSlogan: '',
      registrationOpen: true,
      mallOpen: true,
      demandOpen: true,
      reservationOpen: true,
      realnameRequired: false,
      homeCarouselOpen: true,
      leaseExpireRemindDays: 0,
      uploadMaxSizeMb: 10,
      passwordExpireDays: 90,
      minioEnabled: false,
      minioEndpoint: '',
      minioPort: 9000,
      minioUseSsl: false,
      minioAccessKey: '',
      minioSecretKey: '',
      minioBucket: 'joinyuu',
    })
    expect(badWindow.status).toBe(400)
    expect(badWindow.body).toEqual({ code: 400, message: '租约临期提醒窗口须为 1-90 的整数' })

    const badUploadLimit = await put('/api/admin/system/config').send({
      siteName: '聚屿社区',
      siteSlogan: '',
      registrationOpen: true,
      mallOpen: true,
      demandOpen: true,
      reservationOpen: true,
      realnameRequired: false,
      homeCarouselOpen: true,
      leaseExpireRemindDays: 15,
      uploadMaxSizeMb: 0,
      passwordExpireDays: 90,
      minioEnabled: false,
      minioEndpoint: '',
      minioPort: 9000,
      minioUseSsl: false,
      minioAccessKey: '',
      minioSecretKey: '',
      minioBucket: 'joinyuu',
    })
    expect(badUploadLimit.status).toBe(400)
    expect(badUploadLimit.body).toEqual({ code: 400, message: '上传文件大小限制须为 1-100 的整数' })

    /* 开启「密码过期强制改密」时周期须为 1-3650（旧的 0=不启用语义已由开关取代） */
    const badExpireDays = await put('/api/admin/system/config').send({
      siteName: '聚屿社区',
      siteSlogan: '',
      registrationOpen: true,
      mallOpen: true,
      demandOpen: true,
      reservationOpen: true,
      realnameRequired: false,
      homeCarouselOpen: true,
      leaseExpireRemindDays: 15,
      uploadMaxSizeMb: 10,
      passwordExpireEnabled: true,
      passwordExpireDays: 0,
      minioEnabled: false,
      minioEndpoint: '',
      minioPort: 9000,
      minioUseSsl: false,
      minioAccessKey: '',
      minioSecretKey: '',
      minioBucket: 'joinyuu',
    })
    expect(badExpireDays.status).toBe(400)
    expect(badExpireDays.body).toEqual({ code: 400, message: '密码过期周期须为 1-3650 的整数' })
  })

  it('系统配置密钥：留空保持原值、非空轮换、审计与出参都不留密钥原文', async () => {
    const base = {
      siteName: '聚屿社区',
      siteSlogan: '',
      registrationOpen: true,
      mallOpen: true,
      demandOpen: true,
      reservationOpen: true,
      realnameRequired: false,
      homeCarouselOpen: true,
      leaseExpireRemindDays: 15,
      uploadMaxSizeMb: 10,
      passwordExpireDays: 90,
      minioEnabled: false,
      minioEndpoint: 'minio.local',
      minioPort: 9000,
      minioUseSsl: false,
      minioAccessKey: 'joinyuu',
      minioBucket: 'joinyuu',
    }

    /* 先写入 v1 密钥 */
    const seeded = await put('/api/admin/system/config').send({ ...base, minioSecretKey: 'secret-v1' })
    expect(seeded.status).toBe(200)

    /* 留空提交：其余配置更新，密钥保持原值不被清空 */
    const keep = await put('/api/admin/system/config').send({ ...base, uploadMaxSizeMb: 22 })
    expect(keep.status).toBe(200)
    const afterKeep = await get('/api/admin/system/config')
    expect(afterKeep.body.data.uploadMaxSizeMb).toBe(22)
    expect(afterKeep.body.data.minioSecretKeyConfigured).toBe(true)
    expect(afterKeep.body.data.minioSecretKey).toBeUndefined()

    /* 非空提交：轮换密钥，接口仍只暴露「已配置」，不回传原文 */
    const rotate = await put('/api/admin/system/config').send({ ...base, minioSecretKey: 'secret-v2' })
    expect(rotate.status).toBe(200)
    const afterRotate = await get('/api/admin/system/config')
    expect(afterRotate.body.data.minioSecretKeyConfigured).toBe(true)
    expect(afterRotate.body.data.minioSecretKey).toBeUndefined()

    /* 数据库保存最近一次密钥；审计快照（before/after/detail）不得含任何密钥原文 */
    const prisma = new PrismaClient()
    try {
      const row = await prisma.systemConfig.findUnique({ where: { id: 1 } })
      expect(row?.minioSecretKey).toBe('secret-v2')

      const logs = await prisma.auditLog.findMany({
        where: { module: '系统管理', action: '保存系统配置' },
        orderBy: { id: 'desc' },
        take: 10,
      })
      expect(logs.length).toBeGreaterThan(0)
      for (const log of logs) {
        const serialized = JSON.stringify({ detail: log.detail, before: log.before, after: log.after })
        expect(serialized).not.toContain('secret-v1')
        expect(serialized).not.toContain('secret-v2')
        expect(serialized).not.toContain('joinyuu-secret')
      }
      const latest = logs[0].after as { minioSecretKeyChanged?: boolean; minioSecretKey?: unknown } | null
      expect(latest?.minioSecretKeyChanged).toBe(true)
      expect(latest?.minioSecretKey).toBeUndefined()
    } finally {
      await prisma.$disconnect()
    }
  })

  it('实名核验配置：启用需单选供应商、inline 凭据只写不泄露、变更即重置联通', async () => {
    const base = {
      siteName: '聚屿社区',
      siteSlogan: '',
      registrationOpen: true,
      mallOpen: true,
      demandOpen: true,
      reservationOpen: true,
      realnameRequired: false,
      homeCarouselOpen: true,
      leaseExpireRemindDays: 15,
      uploadMaxSizeMb: 10,
      passwordExpireDays: 90,
      minioEnabled: false,
      minioEndpoint: 'minio.local',
      minioPort: 9000,
      minioUseSsl: false,
      minioAccessKey: 'joinyuu',
      minioBucket: 'joinyuu',
      realnameVerifyEnabled: true,
      realnameVerifyProvider: 'tencent',
      realnameVerifyCredentialMode: 'inline',
      realnameVerifyConfig: { region: 'ap-guangzhou' },
      realnameVerifyCredentialEnv: { secretId: 'AKID-inline-0001', secretKey: 'sk-inline-xxxx' },
    }

    /* 启用但未选供应商 → 400 */
    const noProvider = await put('/api/admin/system/config').send({ ...base, realnameVerifyProvider: '' })
    expect(noProvider.status).toBe(400)
    expect(noProvider.body.message).toContain('必须选择一个供应商')

    /* 凭据项不属于该供应商 → 400 */
    const badKey = await put('/api/admin/system/config').send({
      ...base,
      realnameVerifyCredentialEnv: { wrongKey: 'X_1' },
    })
    expect(badKey.status).toBe(400)
    expect(badKey.body.message).toContain('不属于该供应商')

    /* 正常保存：inline 凭据只写、只回掩码、不回原文；未测试联通 → 客户端为「身份信息登记」 */
    const saved = await put('/api/admin/system/config').send(base)
    expect(saved.status).toBe(200)
    const after = await get('/api/admin/system/config')
    expect(after.body.data.realnameVerifyCredentialMode).toBe('inline')
    expect(after.body.data.realnameVerifyCredentialConfigured).toBe(true)
    expect(after.body.data.realnameVerifyCredentialEnv).toEqual({})
    expect(after.body.data.realnameVerifyCredentialMasked).toEqual({ secretId: '********', secretKey: '********' })
    expect(JSON.stringify(after.body.data)).not.toContain('AKID-inline-0001')
    expect(after.body.data.realnameVerifyTestOk).toBe(false)
    expect(after.body.data.realnameMode).toBe('registration')

    const prisma = new PrismaClient()
    try {
      const row = await prisma.systemConfig.findUnique({ where: { id: 1 } })
      expect(JSON.stringify(row?.realnameVerifyCredentialEnv)).toContain('sk-inline-xxxx')

      /* 模拟"已联通"：仅改站点名（非核验配置）+ 凭据留空 → 凭据保持、联通状态不重置 */
      await prisma.systemConfig.update({
        where: { id: 1 },
        data: { realnameVerifyTestOk: true, realnameVerifyTestedAt: '2026-09-21 00:00' },
      })
      const keep = await put('/api/admin/system/config').send({
        ...base,
        siteName: '聚屿社区（测试）',
        realnameVerifyCredentialEnv: {},
      })
      expect(keep.status).toBe(200)
      const afterKeep = await get('/api/admin/system/config')
      expect(afterKeep.body.data.realnameVerifyCredentialConfigured).toBe(true)
      expect(afterKeep.body.data.realnameVerifyTestOk).toBe(true)
      expect(afterKeep.body.data.realnameMode).toBe('verified')

      /* 审计快照不含 inline 凭据原文 */
      const logs = await prisma.auditLog.findMany({
        where: { module: '系统管理', action: '保存系统配置' },
        orderBy: { id: 'desc' },
        take: 8,
      })
      expect(logs.length).toBeGreaterThan(0)
      for (const log of logs) {
        const text = JSON.stringify({ detail: log.detail, before: log.before, after: log.after })
        expect(text).not.toContain('AKID-inline-0001')
        expect(text).not.toContain('sk-inline-xxxx')
      }

      /* 变更核验参数 → 联通状态重置为未联通，客户端文案回到「身份信息登记」 */
      const changed = await put('/api/admin/system/config').send({
        ...base,
        siteName: '聚屿社区（测试）',
        realnameVerifyConfig: { region: 'ap-guangzhou', endpoint: 'faceid.tencentcloudapi.com' },
        realnameVerifyCredentialEnv: {},
      })
      expect(changed.status).toBe(200)
      const afterChanged = await get('/api/admin/system/config')
      expect(afterChanged.body.data.realnameVerifyTestOk).toBe(false)
      expect(afterChanged.body.data.realnameMode).toBe('registration')
    } finally {
      await prisma.$disconnect()
    }
  })
  it('系统配置：全局移动端地址保存、读取、校验与旧载荷兼容', async () => {
    const before = (await get('/api/admin/system/config')).body.data
    const payload = { ...before, mobileUrl: 'https://mobile.example.com/community/' }
    expect((await put('/api/admin/system/config').send(payload)).status).toBe(200)
    expect((await get('/api/admin/system/config')).body.data.mobileUrl).toBe(payload.mobileUrl)
    expect((await request(app.getHttpServer()).get('/api/app/config')).body.data.mobileUrl).toBe(payload.mobileUrl)
    const { mobileUrl: _mobileUrl, ...legacy } = before
    expect((await put('/api/admin/system/config').send(legacy)).status).toBe(200)
    expect((await get('/api/admin/system/config')).body.data.mobileUrl).toBe(payload.mobileUrl)
    for (const invalid of [null, 'javascript:alert(1)', 'https://u:p@example.com', 'https://mobile.example.com/#home', '']) {
      expect((await put('/api/admin/system/config').send({ ...payload, mobileUrl: invalid })).status).toBe(400)
      expect((await get('/api/admin/system/config')).body.data.mobileUrl).toBe(payload.mobileUrl)
    }
    expect((await put('/api/admin/system/config').send({ ...before, mobileUrl: 'localhost:7759' })).status).toBe(200)
  })

  it('日志设置：默认 180 天、0 = 永久保存、越界与非整数 400、审计留痕', async () => {
    /* 默认值：两日志均 180 天 */
    const initial = await get('/api/admin/audit-logs/retention')
    expect(initial.status).toBe(200)
    expect(initial.body.data).toEqual({ auditLogRetentionDays: 180, loginLogRetentionDays: 180 })

    /* 0 = 永久保存 */
    const saved = await put('/api/admin/audit-logs/retention').send({
      auditLogRetentionDays: 0,
      loginLogRetentionDays: 90,
    })
    expect(saved.status).toBe(200)
    expect((await get('/api/admin/audit-logs/retention')).body.data).toEqual({
      auditLogRetentionDays: 0,
      loginLogRetentionDays: 90,
    })

    /* 系统配置旧表单载荷（不带日志保留期字段）不得把已保存的设置重置回 180 */
    const cfg = (await get('/api/admin/system/config')).body.data
    const { auditLogRetentionDays: _auditDays, loginLogRetentionDays: _loginDays, ...legacy } = cfg
    expect((await put('/api/admin/system/config').send(legacy)).status).toBe(200)
    expect((await get('/api/admin/audit-logs/retention')).body.data).toEqual({
      auditLogRetentionDays: 0,
      loginLogRetentionDays: 90,
    })

    /* 越界 / 非整数一律 400 */
    for (const bad of [-1, 3651, 1.5]) {
      const res = await put('/api/admin/audit-logs/retention').send({
        auditLogRetentionDays: bad,
        loginLogRetentionDays: 180,
      })
      expect(res.status).toBe(400)
    }

    /* 审计留痕：动作「保存日志设置」，含前后值 */
    const logs = await get('/api/admin/audit-logs').query({ page: 1, pageSize: 10, keyword: '保存日志设置' })
    expect(logs.body.data.total).toBeGreaterThan(0)
    expect(logs.body.data.list[0].detail).toBe('操作日志保留 永久 · 登录日志保留 90 天')

    /* 复位为默认值，避免影响后续断言 */
    expect(
      (await put('/api/admin/audit-logs/retention').send({
        auditLogRetentionDays: 180,
        loginLogRetentionDays: 180,
      })).status,
    ).toBe(200)
  })

})
