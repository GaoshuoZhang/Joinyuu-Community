import { AuthService } from './auth.service'

describe('app login captcha threshold', () => {
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
      { user: { findUnique: jest.fn(async () => null) } } as never,
      {} as never,
      redis as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    const attempt = () => service.login({ identifier: 'user@example.com', password: 'wrong' }, '127.0.0.1')

    await expect(attempt()).rejects.toMatchObject({ status: 401 })
    await expect(attempt()).rejects.toMatchObject({ status: 401 })
    await expect(attempt()).rejects.toMatchObject({ status: 428 })
    await expect(attempt()).rejects.toMatchObject({ status: 428 })
    await expect(service.login({
      identifier: 'user@example.com', password: 'wrong', captchaId: 'one-time', captchaCode: 'wrong',
    }, '127.0.0.1')).rejects.toThrow('验证码错误')

    expect(failures).toBe(3)
    expect(redis.consumeAndCompare).toHaveBeenCalledTimes(1)
  })
})
