import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common'
import Redis from 'ioredis'

/* Redis 服务（wiki-backend.md §10）：
 * - JWT 登出黑名单（auth:blacklist:{jti}）
 * - 通用 JSON 缓存：config:system / dicts:{type} / rules:points|experience|levels / dashboard:summary
 * 降级策略分两类：
 * 1) 缓存/限流类：连接或读写异常仅记录日志，读返回 null/空（调用方回源 DB 或放行），不中断主流程；
 * 2) 吊销/策略类（黑名单、密码过期标记、安全敏感计数）：默认 fail-closed，异常时抛 503，
 *    避免「静默失效」导致已吊销令牌仍可用。运维可在故障期设置环境变量
 *    AUTH_REVOCATION_FAIL_OPEN=1 切换为放行（可用性优先，需自行承担窗口期风险）。 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis
  /** 吊销/策略类读写失败时是否降级放行（默认 false = fail-closed） */
  private readonly revocationFailOpen: boolean = process.env.AUTH_REVOCATION_FAIL_OPEN === '1'

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      retryStrategy: (times: number): number => Math.min(times * 500, 5000),
    })
    this.client.on('error', (err: Error): void => {
      console.error('[redis] 连接错误:', err.message)
    })
  }

  /** 吊销/策略类失败处理：默认抛 503（fail-closed）；放行模式仅告警 */
  private revocationFailure(op: string, e: unknown): void {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[redis] ${op}失败:`, message)
    if (!this.revocationFailOpen) {
      throw new ServiceUnavailableException('会话校验服务暂不可用，请稍后重试')
    }
    console.error('[redis] AUTH_REVOCATION_FAIL_OPEN=1：降级放行（窗口期内安全策略可能失效）')
  }

  /** 将 JWT jti 加入黑名单（剩余有效期秒数）；失败默认抛 503（避免登出/踢人静默失效） */
  async blacklist(jti: string, seconds: number): Promise<void> {
    if (seconds <= 0) return
    try {
      await this.client.set(`auth:blacklist:${jti}`, '1', 'EX', seconds)
    } catch (e) {
      this.revocationFailure('黑名单写入', e)
    }
  }

  /** jti 是否已被拉黑；Redis 不可用时默认 fail-closed（抛 503），避免已吊销令牌继续可用 */
  async isBlacklisted(jti: string): Promise<boolean> {
    try {
      return (await this.client.exists(`auth:blacklist:${jti}`)) === 1
    } catch (e) {
      this.revocationFailure('黑名单查询', e)
      return false
    }
  }

  /** 写入策略标记键（固定值 1，TTL 秒）；失败默认抛 503（如密码过期标记必须真实生效） */
  async setFlag(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, '1', 'EX', ttlSeconds)
    } catch (e) {
      this.revocationFailure('策略标记写入', e)
    }
  }

  /** 原子抢占短期标记；Redis 故障时 fail-open，数据库约束/事务仍负责最终一致性。 */
  async acquireFlag(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return (await this.client.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK'
    } catch (e) {
      console.error('[redis] 标记抢占失败，降级放行:', e instanceof Error ? e.message : e)
      return true
    }
  }

  /** 策略标记是否存在；Redis 不可用时默认 fail-closed（抛 503），避免策略静默失效 */
  async hasFlag(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) === 1
    } catch (e) {
      this.revocationFailure('策略标记查询', e)
      return false
    }
  }

  /** 自增计数（首次写入时设置 TTL 秒）；Redis 异常返回 null（调用方降级放行） */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number | null> {
    try {
      const count = await this.client.incr(key)
      if (count === 1) await this.client.expire(key, ttlSeconds)
      return count
    } catch (e) {
      console.error('[redis] 计数失败，降级放行:', e instanceof Error ? e.message : e)
      return null
    }
  }

  /** 安全敏感自增计数（如验证码校验失败次数）：Redis 异常时抛 503（fail-closed），不放行 */
  async incrWithTtlStrict(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.incrWithTtl(key, ttlSeconds)
    if (count === null) {
      throw new ServiceUnavailableException('风控服务暂不可用，请稍后重试')
    }
    return count
  }

  /** 读取 JSON 缓存；未命中或 Redis 异常返回 null（调用方回源 DB） */
  async getCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key)
      if (raw == null) return null
      return JSON.parse(raw) as T
    } catch (e) {
      console.error('[redis] 缓存读取失败，降级回源:', e instanceof Error ? e.message : e)
      return null
    }
  }

  /** 原子读取并删除一次性凭据（如 OAuth ticket/state）；未命中或异常返回 null。 */
  async takeCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.getdel(key)
      if (raw == null) return null
      return JSON.parse(raw) as T
    } catch (e) {
      console.error('[redis] 一次性凭据读取失败，按失效处理:', e instanceof Error ? e.message : e)
      return null
    }
  }

  /** 写入 JSON 缓存（TTL 秒）；失败仅告警 */
  async setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds)
    } catch (e) {
      console.error('[redis] 缓存写入失败:', e instanceof Error ? e.message : e)
    }
  }

  /** 删除缓存键（写操作后失效）；失败仅告警 */
  async delCache(...keys: string[]): Promise<void> {
    if (keys.length === 0) return
    try {
      await this.client.del(...keys)
    } catch (e) {
      console.error('[redis] 缓存失效失败:', e instanceof Error ? e.message : e)
    }
  }

  /** 删除缓存键（安全敏感失效）：失败抛 503（fail-closed），避免「权限/策略已变更但缓存未失效」的越权窗口
   * （BE-M9：RBAC 改角色/停用/重置密码后必须确保旧权限缓存真实清除） */
  async delCacheStrict(...keys: string[]): Promise<void> {
    if (keys.length === 0) return
    try {
      await this.client.del(...keys)
    } catch (e) {
      this.revocationFailure('缓存失效', e)
    }
  }

  /** 按前缀批量清理键（SCAN+DEL，如关闭「密码过期强制改密」后清除残留的过期标记）；失败仅告警，返回删除数量。
   * 仅用于低频写路径（配置保存），不在请求热路径使用。 */
  async delByPrefix(prefix: string): Promise<number> {
    let removed = 0
    try {
      let cursor = '0'
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)
        cursor = next
        if (keys.length) removed += await this.client.del(...keys)
      } while (cursor !== '0')
    } catch (e) {
      console.error('[redis] 前缀清理失败:', e instanceof Error ? e.message : e)
    }
    return removed
  }

  /** 原子「比对并删除」：用于一次性凭据（验证码）消费。
   * GET 与 DEL 在同一 Lua 脚本内执行，避免并发下同一验证码被两个请求同时校验通过。
   * 返回 true 仅当键存在且值与 expected 一致；Redis 异常返回 false（fail-closed，视为校验失败）。 */
  async compareAndDelete(key: string, expected: string): Promise<boolean> {
    try {
      const result = (await this.client.eval(
        "local v = redis.call('GET', KEYS[1]); if not v then return '0' end; if v == ARGV[1] then redis.call('DEL', KEYS[1]); return '1' end; return '0'",
        1,
        key,
        JSON.stringify(expected),
      )) as string
      return result === '1'
    } catch (e) {
      console.error('[redis] 验证码校验失败（按校验不通过处理）:', e instanceof Error ? e.message : e)
      return false
    }
  }

  /** 原子「读取-删除-比对」（一次性凭据消费，无论是否匹配都删除）：
   * 图形验证码需要「错误也消费」以防止同一 captchaId 被反复爆破，同时避免并发下
   * 同一验证码被两个请求同时校验通过；GET/DEL/比较在同一 Lua 脚本内完成。
   * Redis 异常返回 false（fail-closed，视为校验失败）。 */
  async consumeAndCompare(key: string, expected: string): Promise<boolean> {
    try {
      const result = (await this.client.eval(
        "local v = redis.call('GET', KEYS[1]); if not v then return '0' end; redis.call('DEL', KEYS[1]); if v == ARGV[1] then return '1' end; return '0'",
        1,
        key,
        JSON.stringify(expected),
      )) as string
      return result === '1'
    } catch (e) {
      console.error('[redis] 验证码消费失败（按校验不通过处理）:', e instanceof Error ? e.message : e)
      return false
    }
  }

  /** 读取 Hash 全部字段；Redis 异常返回空对象（调用方降级） */
  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key)
    } catch (e) {
      console.error('[redis] Hash 读取失败，降级为空:', e instanceof Error ? e.message : e)
      return {}
    }
  }

  /** 读取 Hash 单字段；字段不存在或 Redis 异常返回 null */
  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field)
    } catch (e) {
      console.error('[redis] Hash 字段读取失败，降级为空:', e instanceof Error ? e.message : e)
      return null
    }
  }

  /** 写入 Hash 单字段（HSET）；失败仅告警 */
  async hset(key: string, field: string, value: string): Promise<void> {
    try {
      await this.client.hset(key, field, value)
    } catch (e) {
      console.error('[redis] Hash 写入失败:', e instanceof Error ? e.message : e)
    }
  }

  /** 批量删除 Hash 字段（HDEL）；失败仅告警 */
  async hdel(key: string, ...fields: string[]): Promise<void> {
    if (fields.length === 0) return
    try {
      await this.client.hdel(key, ...fields)
    } catch (e) {
      console.error('[redis] Hash 字段删除失败:', e instanceof Error ? e.message : e)
    }
  }

  /** 刷新键剩余有效期（EXPIRE 秒）；失败仅告警 */
  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds)
    } catch (e) {
      console.error('[redis] TTL 刷新失败:', e instanceof Error ? e.message : e)
    }
  }

  /** 读缓存未命中则回源并写入（只缓存非空集合/单例，列表分页不缓存） */
  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const hit = await this.getCache<T>(key)
    if (hit !== null) return hit
    const value = await loader()
    await this.setCache(key, value, ttlSeconds)
    return value
  }

  /** PING 往返耗时（ms）；Redis 不可用返回 -1（降级展示） */
  async ping(): Promise<number> {
    try {
      const t0 = Date.now()
      await this.client.ping()
      return Date.now() - t0
    } catch {
      return -1
    }
  }

  /** Redis INFO 原文；不可用返回空串 */
  async info(): Promise<string> {
    try {
      return await this.client.info()
    } catch {
      return ''
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch((): void => {
      this.client.disconnect()
    })
  }
}
