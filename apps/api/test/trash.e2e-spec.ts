/* M1.5 R12 归档管理（软删除）e2e：
 * 覆盖：删除 → 原列表不可见 → 归档列表可见 → 恢复可见 → 彻底删除（物理）不存在；审计留痕。
 * 覆盖域：announcement / article（官方资讯）/ submission（投稿）/ enterprise / demand（驳回后归档）/
 *        goods（商品，走商城归档端点）/ order（商城订单，走商城归档端点）/ application（申请审核）；
 * 归档设置（14 标签页、企业不支持自动归档、按状态自动归档开关）与 TrashService.runAutoArchive 自动归档。
 * 前置：seed（公告 AN1006 / 官方文章 A1010 / 投稿 SU1008 / 企业 E2003 / 待审核需求 D4005、D4008 /
 *       已下架商品 G1009 / 已完成订单 RO2001）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { TrashService } from '../src/modules/system/trash/trash.service'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1.5 R12 归档管理（软删除）', () => {
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
  const announcementIds = async (): Promise<string[]> => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set(auth())
      .query({ page: 1, pageSize: 50 })
    return (res.body.data.list as Array<{ id: string }>).map((a) => a.id)
  }
  const trashList = async (
    domain: string,
  ): Promise<Array<{ id: string; domain: string; domainLabel: string }>> => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/trash')
      .set(auth())
      .query({ page: 1, pageSize: 50, domain })
    return res.body.data.list
  }

  it('公告归档：下架后软删、列表不可见、归档列表可见（公告栏），恢复后回到列表', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set(auth())
      .query({ page: 1, pageSize: 50 })
    const all = listRes.body.data.list as Array<{ id: string; status: string }>
    expect(all.length).toBeGreaterThan(0)
    const target = (all.find((a) => a.status === 'published') ?? all[0]).id
    const current = all.find((a) => a.id === target)
    if (current?.status !== 'withdrawn') {
      const wd = await request(app.getHttpServer())
        .post(`/api/admin/announcements/${target}/withdraw`)
        .set(auth())
      expect(wd.status).toBe(200)
    }

    const del = await request(app.getHttpServer())
      .delete(`/api/admin/announcements/${target}`)
      .set(auth())
    expect(del.status).toBe(200)
    expect(await announcementIds()).not.toContain(target)

    const trash = await trashList('announcement')
    const item = trash.find((t) => t.id === target)
    expect(item).toBeTruthy()
    expect(item?.domain).toBe('announcement')
    expect(item?.domainLabel).toBe('公告栏')

    const restore = await request(app.getHttpServer())
      .post(`/api/admin/trash/announcement/${target}/restore`)
      .set(auth())
    expect(restore.status).toBe(200)
    expect(await announcementIds()).toContain(target)
  })

  it('公告彻底删除：归档列表与原列表均删除；重复彻底删除 404', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/admin/announcements')
      .set(auth())
      .query({ page: 1, pageSize: 50 })
    const all = listRes.body.data.list as Array<{ id: string; status: string }>
    const target = (all.find((a) => a.status === 'withdrawn') ?? all[0]).id
    const current = all.find((a) => a.id === target)
    if (current?.status !== 'withdrawn') {
      const wd = await request(app.getHttpServer())
        .post(`/api/admin/announcements/${target}/withdraw`)
        .set(auth())
      expect(wd.status).toBe(200)
    }
    const del = await request(app.getHttpServer())
      .delete(`/api/admin/announcements/${target}`)
      .set(auth())
    expect(del.status).toBe(200)
    expect(await trashList('announcement')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: target })]),
    )

    const purge = await request(app.getHttpServer())
      .post(`/api/admin/trash/announcement/${target}/purge`)
      .set(auth())
    expect(purge.status).toBe(200)
    expect(await trashList('announcement')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: target })]),
    )
    expect(await announcementIds()).not.toContain(target)

    const again = await request(app.getHttpServer())
      .post(`/api/admin/trash/announcement/${target}/purge`)
      .set(auth())
    expect(again.status).toBe(404)
    expect(again.body).toEqual({ code: 404, message: '归档中不存在该对象' })
  })

  it('官方资讯软删 → 归档列表 article（资讯发布）→ 恢复', async () => {
    const del = await request(app.getHttpServer())
      .delete('/api/admin/contents/articles/A1010')
      .set(auth())
    expect(del.status).toBe(200)

    const trash = await trashList('article')
    const item = trash.find((t) => t.id === 'A1010')
    expect(item).toBeTruthy()
    expect(item?.domainLabel).toBe('资讯发布')

    const restore = await request(app.getHttpServer())
      .post('/api/admin/trash/article/A1010/restore')
      .set(auth())
    expect(restore.status).toBe(200)

    const list = await request(app.getHttpServer())
      .get('/api/admin/contents/articles')
      .set(auth())
      .query({ page: 1, pageSize: 50, keyword: 'A1010' })
    expect((list.body.data.list as Array<{ id: string }>).some((a) => a.id === 'A1010')).toBe(true)
  })

  it('投稿内容软删 → 归档列表 submission（投稿内容）→ 恢复', async () => {
    const del = await request(app.getHttpServer())
      .delete('/api/admin/contents/articles/SU1008')
      .set(auth())
    expect(del.status).toBe(200)

    const trash = await trashList('submission')
    const item = trash.find((t) => t.id === 'SU1008')
    expect(item).toBeTruthy()
    expect(item?.domainLabel).toBe('投稿内容')
    /* 官方资讯标签页不包含投稿 */
    expect((await trashList('article')).some((t) => t.id === 'SU1008')).toBe(false)

    const restore = await request(app.getHttpServer())
      .post('/api/admin/trash/submission/SU1008/restore')
      .set(auth())
    expect(restore.status).toBe(200)
  })

  it('企业删除：软归档后不可见 → 归档列表 enterprise（社区企业）→ 恢复', async () => {
    const del = await request(app.getHttpServer())
      .delete('/api/admin/enterprises/E2003')
      .set(auth())
    expect(del.status).toBe(200)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2003')
      .set(auth())
    expect(detail.status).toBe(404)

    const trash = await trashList('enterprise')
    const item = trash.find((t) => t.id === 'E2003')
    expect(item).toBeTruthy()
    expect(item?.domainLabel).toBe('社区企业')

    const restore = await request(app.getHttpServer())
      .post('/api/admin/trash/enterprise/E2003/restore')
      .set(auth())
    expect(restore.status).toBe(200)

    const back = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2003')
      .set(auth())
    expect(back.status).toBe(200)
  })

  it('需求：驳回后归档 → 归档列表 demand（需求）→ 恢复', async () => {
    const reject = await request(app.getHttpServer())
      .post('/api/admin/demands/D4008/reject')
      .set(auth())
      .send({ reason: '归档流程测试驳回' })
    expect(reject.status).toBe(200)

    const archive = await request(app.getHttpServer())
      .post('/api/admin/demands/D4008/archive')
      .set(auth())
    expect(archive.status).toBe(200)

    const trash = await trashList('demand')
    const item = trash.find((t) => t.id === 'D4008')
    expect(item).toBeTruthy()
    expect(item?.domainLabel).toBe('需求')

    const restore = await request(app.getHttpServer())
      .post('/api/admin/trash/demand/D4008/restore')
      .set(auth())
    expect(restore.status).toBe(200)
    expect((await trashList('demand')).some((t) => t.id === 'D4008')).toBe(false)
  })

  it('商品归档：下架商品 → 归档列表 goods（商品）→ 恢复后商品列表可见', async () => {
    const archive = await request(app.getHttpServer())
      .post('/api/admin/mall/goods/G1009/archive')
      .set(auth())
    expect(archive.status).toBe(200)

    const trash = await trashList('goods')
    const item = trash.find((t) => t.id === 'G1009')
    expect(item).toBeTruthy()
    expect(item?.domainLabel).toBe('商品')

    const restore = await request(app.getHttpServer())
      .post('/api/admin/trash/goods/G1009/restore')
      .set(auth())
    expect(restore.status).toBe(200)
    expect((await trashList('goods')).some((t) => t.id === 'G1009')).toBe(false)

    const list = await request(app.getHttpServer())
      .get('/api/admin/mall/goods')
      .set(auth())
      .query({ page: 1, pageSize: 50, keyword: 'G1009' })
    expect((list.body.data.list as Array<{ id: string }>).some((g) => g.id === 'G1009')).toBe(true)
  })

  it('商城订单归档：已完成订单 → 归档列表 order（商城订单）→ 恢复', async () => {
    const archive = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2001/archive')
      .set(auth())
    expect(archive.status).toBe(200)

    const trash = await trashList('order')
    const item = trash.find((t) => t.id === 'RO2001')
    expect(item).toBeTruthy()
    expect(item?.domainLabel).toBe('商城订单')

    const restore = await request(app.getHttpServer())
      .post('/api/admin/trash/order/RO2001/restore')
      .set(auth())
    expect(restore.status).toBe(200)
    expect((await trashList('order')).some((t) => t.id === 'RO2001')).toBe(false)

    const list = await request(app.getHttpServer())
      .get('/api/admin/mall/redemption-orders')
      .set(auth())
      .query({ page: 1, pageSize: 50, keyword: 'RO2001' })
    expect((list.body.data.list as Array<{ id: string }>).some((o) => o.id === 'RO2001')).toBe(true)
  })

  it('申请归档：已通过申请归档 → 归档列表 application（申请审核）→ 恢复；待审核申请归档 409', async () => {
    const list = async (): Promise<Array<{ id: string }>> => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/applications')
        .set(auth())
        .query({ page: 1, pageSize: 50 })
      return res.body.data.list as Array<{ id: string }>
    }
    expect((await list()).some((a) => a.id === 'AP3001')).toBe(true)

    const archive = await request(app.getHttpServer())
      .post('/api/admin/applications/AP3001/archive')
      .set(auth())
    expect(archive.status).toBe(200)
    expect((await list()).some((a) => a.id === 'AP3001')).toBe(false)

    const trash = await trashList('application')
    const item = trash.find((t) => t.id === 'AP3001')
    expect(item).toBeTruthy()
    expect(item?.domain).toBe('application')
    expect(item?.domainLabel).toBe('申请审核')

    const restore = await request(app.getHttpServer())
      .post('/api/admin/trash/application/AP3001/restore')
      .set(auth())
    expect(restore.status).toBe(200)
    expect((await trashList('application')).some((t) => t.id === 'AP3001')).toBe(false)
    expect((await list()).some((a) => a.id === 'AP3001')).toBe(true)

    const conflict = await request(app.getHttpServer())
      .post('/api/admin/applications/AP3015/archive')
      .set(auth())
    expect(conflict.status).toBe(409)
    expect(conflict.body).toEqual({ code: 409, message: '仅已通过或已驳回的申请可归档' })
  })

  it('归档设置：14 个标签页；企业不支持自动归档 → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/trash/settings')
      .set(auth())
    expect(res.status).toBe(200)
    const settings = res.body.data as Array<{
      domain: string
      label: string
      autoArchive: boolean
      autoArchiveSupported: boolean
      purgeDelayDays: number
      archivableStatuses: Array<{ value: string; label: string; enabled: boolean }>
    }>
    expect(settings.length).toBe(14)
    expect(settings.map((s) => s.domain)).toEqual([
      'enterprise',
      'externalEnterprise',
      'article',
      'submission',
      'announcement',
      'demand',
      'project',
      'event',
      'lease',
      'reservation',
      'goods',
      'order',
      'application',
      'userMessage',
    ])
    expect(settings.map((s) => s.label)).toEqual(
      expect.arrayContaining(['商品', '商城订单', '申请审核']),
    )
    const enterprise = settings.find((s) => s.domain === 'enterprise')
    expect(enterprise?.autoArchiveSupported).toBe(false)
    expect(enterprise?.label).toBe('社区企业')
    expect(enterprise?.archivableStatuses).toEqual([])
    expect(settings.find((s) => s.domain === 'demand')?.autoArchiveSupported).toBe(true)
    expect(settings.find((s) => s.domain === 'demand')?.archivableStatuses.map((s) => s.value)).toEqual([
      'rejected',
      'closed',
      'projected',
    ])
    expect(settings.find((s) => s.domain === 'article')?.archivableStatuses.map((s) => s.value)).toEqual([
      'pending_release',
      'closed',
    ])
    expect(settings.find((s) => s.domain === 'submission')?.archivableStatuses.map((s) => s.value)).toEqual([
      'pending_release',
      'rejected',
      'closed',
    ])
    expect(settings.find((s) => s.domain === 'goods')?.archivableStatuses).toEqual([
      { value: 'off', label: '已下架', enabled: false },
    ])
    expect(settings.find((s) => s.domain === 'application')?.archivableStatuses).toEqual([
      { value: 'approved', label: '已通过', enabled: false },
      { value: 'rejected', label: '已驳回', enabled: false },
    ])

    const unsupported = await request(app.getHttpServer())
      .put('/api/admin/trash/settings/enterprise')
      .set(auth())
      .send({ autoArchive: true })
    expect(unsupported.status).toBe(400)
    expect(unsupported.body).toEqual({ code: 400, message: '该标签页不支持自动归档' })

    const updated = await request(app.getHttpServer())
      .put('/api/admin/trash/settings/demand')
      .set(auth())
      .send({
        autoArchive: true,
        archiveDelayDays: 0,
        archiveStatuses: { rejected: true, closed: true, projected: true },
      })
    expect(updated.status).toBe(200)
    expect(updated.body.data).toEqual(
      expect.objectContaining({
        domain: 'demand',
        autoArchive: true,
        archiveDelayDays: 0,
        archivableStatuses: [
          { value: 'rejected', label: '已驳回', enabled: true },
          { value: 'closed', label: '已关闭', enabled: true },
          { value: 'projected', label: '已立项', enabled: true },
        ],
      }),
    )
  })

  it('自动归档状态开关：关闭 rejected 后 runAutoArchive 跳过已驳回需求', async () => {
    const disable = await request(app.getHttpServer())
      .put('/api/admin/trash/settings/demand')
      .set(auth())
      .send({ autoArchive: true, archiveDelayDays: 0, archiveStatuses: { rejected: false } })
    expect(disable.status).toBe(200)

    const trashService = app.get(TrashService)
    await trashService.runAutoArchive()
    expect((await trashList('demand')).some((t) => t.id === 'D4008')).toBe(false)

    const enable = await request(app.getHttpServer())
      .put('/api/admin/trash/settings/demand')
      .set(auth())
      .send({ autoArchive: true, archiveDelayDays: 0, archiveStatuses: { rejected: true } })
    expect(enable.status).toBe(200)
    expect(
      (
        enable.body.data.archivableStatuses as Array<{ value: string; enabled: boolean }>
      ).find((s) => s.value === 'rejected')?.enabled,
    ).toBe(true)
  })

  it('自动归档：开启 demand 后 runAutoArchive 将已驳回需求写入归档', async () => {
    const reject = await request(app.getHttpServer())
      .post('/api/admin/demands/D4005/reject')
      .set(auth())
      .send({ reason: '自动归档流程测试驳回' })
    expect(reject.status).toBe(200)

    const trashService = app.get(TrashService)
    const archived = await trashService.runAutoArchive()
    expect(archived).toBeGreaterThan(0)

    const trash = await trashList('demand')
    expect(trash.some((t) => t.id === 'D4005')).toBe(true)
  })

  it('在线对象不可恢复/彻底删除：restore 与 purge 均 404，对象保持在线', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/admin/contents/articles')
      .set(auth())
      .query({ page: 1, pageSize: 50 })
    const online = (list.body.data.list as Array<{ id: string }>)[0]
    expect(online).toBeTruthy()
    const target = online.id

    const restore = await request(app.getHttpServer())
      .post(`/api/admin/trash/article/${target}/restore`)
      .set(auth())
    expect(restore.status).toBe(404)
    expect(restore.body).toEqual({ code: 404, message: '归档中不存在该对象' })

    const purge = await request(app.getHttpServer())
      .post(`/api/admin/trash/article/${target}/purge`)
      .set(auth())
    expect(purge.status).toBe(404)
    expect(purge.body).toEqual({ code: 404, message: '归档中不存在该对象' })

    const after = await request(app.getHttpServer())
      .get('/api/admin/contents/articles')
      .set(auth())
      .query({ page: 1, pageSize: 50, keyword: target })
    expect((after.body.data.list as Array<{ id: string }>).some((a) => a.id === target)).toBe(true)
  })

  it('不支持的归档标签页 → 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/trash/unknown/XX1/restore')
      .set(auth())
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ code: 404, message: '不支持的归档标签页' })

    const setting = await request(app.getHttpServer())
      .put('/api/admin/trash/settings/unknown')
      .set(auth())
      .send({ autoPurge: true })
    expect(setting.status).toBe(404)
    expect(setting.body).toEqual({ code: 404, message: '不支持的归档标签页' })
  })
})
