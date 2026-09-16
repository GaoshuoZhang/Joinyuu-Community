import { Injectable, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'

/* Redis 服务（wiki-backend.md §10）：
 * - JWT 登出黑名单（auth:blacklist:{jti}）
 * - 通用 JSON 缓存：config:system / dicts:{type} / rules:points|experience|levels / dashboard:summary
 * 降级策略：连接/读写异常仅记录日志，缓存读取返回 null（调用方回源 DB），写操作正常完成——不中断主流程。 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      retryStrategy: (times: number): number => Math.min(times * 500, 5000),
    })
    this.client.on('error', (err: Error): void => {
      console.error('[redis] 连接错误:', err.message)
    })
  }

  /** 将 JWT jti 加入黑名单（剩余有效期秒数）；Redis 异常仅告警，不阻断登出/踢人流程 */
  async blacklist(jti: string, seconds: number): Promise<void> {
    if (seconds <= 0) return
    try {
      await this.client.set(`auth:blacklist:${jti}`, '1', 'EX', seconds)
    } catch (e) {
      console.error(
        '[redis] 黑名单写入失败（令牌将保留至自然过期）:',
        e instanceof Error ? e.message : e,
      )
    }
  }

  /** jti 是否已被拉黑；Redis 不可用时降级返回 false（fail-open） */
  async isBlacklisted(jti: string): Promise<boolean> {
    try {
      return (await this.client.exists(`auth:blacklist:${jti}`)) === 1
    } catch (e) {
      console.error('[redis] 黑名单查询失败，降级放行:', e instanceof Error ? e.message : e)
      return false
    }
  }

  /** 写入标记键（固定值 1，TTL 秒）；失败仅告警（fail-open 不阻断主流程） */
  async setFlag(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, '1', 'EX', ttlSeconds)
    } catch (e) {
      console.error('[redis] 标记写入失败:', e instanceof Error ? e.message : e)
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

  /** 标记键是否存在；Redis 不可用时降级返回 false（fail-open 放行） */
  async hasFlag(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) === 1
    } catch (e) {
      console.error('[redis] 标记查询失败，降级放行:', e instanceof Error ? e.message : e)
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
