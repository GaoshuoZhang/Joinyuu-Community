import { assertSafeTestEnvironment } from './test-environment'

const safeEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://joinyuu:joinyuu@127.0.0.1:5432/joinyuu_it?schema=public',
  REDIS_URL: 'redis://127.0.0.1:6379/15',
}

describe('assertSafeTestEnvironment', () => {
  it('拒绝非 test 环境', () => {
    expect(() => assertSafeTestEnvironment({ ...safeEnv, NODE_ENV: 'development' })).toThrow('NODE_ENV 必须为 test')
  })

  it('拒绝开发数据库', () => {
    expect(() =>
      assertSafeTestEnvironment({
        ...safeEnv,
        DATABASE_URL: 'postgresql://joinyuu:joinyuu@127.0.0.1:5432/joinyuu?schema=public',
      }),
    ).toThrow('不是隔离测试库')
  })

  it('拒绝 Redis DB 0', () => {
    expect(() => assertSafeTestEnvironment({ ...safeEnv, REDIS_URL: 'redis://127.0.0.1:6379/0' })).toThrow(
      'Redis 必须使用大于 0 的独立 DB',
    )
  })

  it('允许 _it 数据库和独立 Redis DB', () => {
    expect(() => assertSafeTestEnvironment(safeEnv)).not.toThrow()
  })
})
