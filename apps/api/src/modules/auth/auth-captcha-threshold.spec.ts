import { AuthService } from './auth.service'

describe('admin login captcha threshold', () => {
  it('requires captcha after three incorrect passwords and does not count a missing captcha attempt', async () => {
    let failures = 0
    const redis = {
      getCache: jest.fn(async (key: string) => key.includes(':lock:') ? null : failures || null),
      incrWithTtlStrict: jest.fn(async () => ++failures),
      setCache: jest.fn(),
      delCache: jest.fn(),
      consumeAndCompare: jest.fn(async () => false),
    }
    const service = new AuthService(
      { adminUser: { findUnique: jest.fn(async () => null) } } as never,
      {} as never,
      redis as never,
      {} as never,
      {} as never,
      {} as never,
      { record: jest.fn() } as never,
    )

    await expect(service.login('admin', 'wrong', { ip: '127.0.0.1', device: 'test' })).rejects.toMatchObject({ status: 401 })
    await expect(service.login('admin', 'wrong', { ip: '127.0.0.1', device: 'test' })).rejects.toMatchObject({ status: 401 })
    await expect(service.login('admin', 'wrong', { ip: '127.0.0.1', device: 'test' })).rejects.toMatchObject({ status: 428 })
    await expect(service.login('admin', 'wrong', { ip: '127.0.0.1', device: 'test' })).rejects.toMatchObject({ status: 428 })
    await expect(service.login('admin', 'wrong', {
      ip: '127.0.0.1', device: 'test', captchaId: 'one-time', captchaCode: 'wrong',
    })).rejects.toThrow('验证码错误')

    expect(failures).toBe(3)
    expect(redis.consumeAndCompare).toHaveBeenCalledTimes(1)
  })
})
