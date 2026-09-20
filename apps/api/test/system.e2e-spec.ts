/* M1-E 系统管理域 e2e（wiki-backend.md §13 M1-E / §7.15 / §7.16）：
 * 覆盖：通知中心（最新在前 / 单条已读 / 全部已读）、操作日志（module 筛选 + keyword 跨字段）、
 * 数据字典（列表 / 新增 / label 全类型唯一 409 / 启停 / 删除重排 sort）、
 * 系统配置（读写 + 校验文案）、工作台聚合（dashboard + todos）。
 * 前置：docker compose up + prisma migrate + seed（N9001+ 通知 / AL1001+ 审计 / 三类字典 / 单例配置）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
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
  })

  it('工作台聚合：stats 计数 + 六域待办 + 待办审核前 5 + 近期活动前 4', async () => {
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

    /* 六域待办（dashboard 内嵌与 /todos 一致） */
    expect(todos.status).toBe(200)
    const keys = (todos.body.data as Array<{ key: string }>).map((t) => t.key)
    expect(keys).toEqual(['settle', 'demand', 'reservation', 'article', 'eventEnrollment', 'lease'])
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
    expect(current.body.data.leaseExpireRemindDays).toBe(15)
    /* R4：GET 返回 7 个 MinIO 字段（种子默认值） */
    expect(current.body.data.minioEnabled).toBe(false)
    expect(current.body.data.minioEndpoint).toBe('')
    expect(current.body.data.minioPort).toBe(9000)
    expect(current.body.data.minioUseSsl).toBe(false)
    expect(current.body.data.minioAccessKey).toBe('')
    expect(current.body.data.minioSecretKey).toBe('')
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
    expect(after.body.data.passwordExpireDays).toBe(120)
    expect(after.body.data.minioEnabled).toBe(false)
    expect(after.body.data.minioEndpoint).toBe('minio.local')
    expect(after.body.data.minioPort).toBe(9001)
    expect(after.body.data.minioUseSsl).toBe(true)
    expect(after.body.data.minioAccessKey).toBe('joinyuu')
    expect(after.body.data.minioSecretKey).toBe('joinyuu-secret')
    expect(after.body.data.minioBucket).toBe('joinyuu-media')
    expect(after.body.data.updatedBy).toBe('社区管理员')

    /* 保存留痕（系统管理，含 MinIO 状态） */
    const logs = await get('/api/admin/audit-logs').query({ page: 1, pageSize: 50, keyword: '保存系统配置' })
    expect(logs.body.data.total).toBe(1)
    expect(logs.body.data.list[0].detail).toBe('临期提醒 20 天 · 上传上限 30 MB · MinIO 已停用 · 密码有效期 120 天')

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
  })
})
