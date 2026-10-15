import { BadRequestException, Controller, Get } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import request from 'supertest'
import { HttpExceptionFilter } from './http-exception.filter'

@Controller()
class ConflictProbeController {
  @Get('conflict')
  async conflict() {
    throw new Prisma.PrismaClientKnownRequestError('duplicate SQL', { code: 'P2002', clientVersion: '6.19.3', meta: { modelName: 'AdminRole', target: ['code'] } })
  }
  @Get('ok')
  ok() { return { ok: true } }
}

describe('unique-constraint HTTP responses', () => {
  function fixture() {
    const filter = new HttpExceptionFilter()
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const host = { switchToHttp: () => ({ getResponse: () => response }) }
    const persist = jest.spyOn(filter as unknown as { persistError: (...args: unknown[]) => void }, 'persistError').mockImplementation(() => {})
    return { filter, response, host, persist }
  }
  afterEach(() => jest.restoreAllMocks())
  it.each([
    ['User', ['phone'], '该联系电话已被其他用户使用'],
    ['AdminUser', ['username'], '该管理员账号已存在'],
    ['AdminRole', ['code'], '该角色编码已存在'],
    ['Workstation', ['seatNo'], '该办公位编号已存在'],
    ['WorkstationArea', ['name'], '该办公区域名称已存在'],
    ['DictEntry', ['label'], '该字典项名称已存在'],
    ['MessageChannel', ['kind', 'provider'], '该通知配置已存在或已被更新，请刷新后重试'],
    ['Unknown', ['secret'], '记录与已有数据重复，请检查唯一字段后重试'],
  ])('handles %s duplicates as 409 without SQL, sensitive values or fault logs', (modelName, target, message) => {
    const { filter, response, host, persist } = fixture()
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Prisma.PrismaClientKnownRequestError('SQL with private-data', {
      code: 'P2002', clientVersion: '6.19.3', meta: { modelName, target },
    })
    filter.catch(error, host as never)
    expect(response.status).toHaveBeenCalledWith(409)
    expect(response.json).toHaveBeenCalledWith({ code: 409, message })
    expect(log).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
    // The same filter can handle a subsequent request after a conflict.
    filter.catch(new BadRequestException('下一次请求'), host as never)
    expect(response.status).toHaveBeenLastCalledWith(400)
  })
  it('keeps unexpected errors at 500 and retains fault logging', () => {
    const { filter, response, host, persist } = fixture()
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    filter.catch(new Error('unexpected failure'), host as never)
    expect(response.status).toHaveBeenCalledWith(500)
    expect(log).toHaveBeenCalled()
    expect(persist).toHaveBeenCalled()
  })
  it('does not hide generated primary-key conflicts as user input errors', () => {
    const { filter, response, host, persist } = fixture()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    filter.catch(new Prisma.PrismaClientKnownRequestError('primary key', {
      code: 'P2002', clientVersion: '6.19.3', meta: { modelName: 'Policy', target: ['id'] },
    }), host as never)
    expect(response.status).toHaveBeenCalledWith(500)
    expect(persist).toHaveBeenCalled()
  })
  it('continues serving HTTP requests after repeated asynchronous unique conflicts', async () => {
    const module = await Test.createTestingModule({ controllers: [ConflictProbeController] }).compile()
    const app = module.createNestApplication()
    app.useGlobalFilters(new HttpExceptionFilter())
    await app.init()
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const conflict = await request(app.getHttpServer()).get('/conflict')
        expect(conflict.status).toBe(409)
        expect(conflict.body).toEqual({ code: 409, message: '该角色编码已存在' })
        await request(app.getHttpServer()).get('/ok').expect(200, { ok: true })
      }
    } finally { await app.close() }
  })
})
