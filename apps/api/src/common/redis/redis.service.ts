import { Injectable, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'

/* Redis 服务：M1-A 用途 = JWT 登出黑名单；后续按 wiki-backend.md §10 扩展缓存
 * 降级策略：连接错误仅记录日志；黑名单查询失败时 fail-open（放行请求）由调用方决定 */
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

  /** 将 JWT jti 加入黑名单（剩余有效期秒数） */
  async blacklist(jti: string, seconds: number): Promise<void> {
    if (seconds > 0) {
      await this.client.set(`auth:blacklist:${jti}`, '1', 'EX', seconds)
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

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch((): void => {
      this.client.disconnect()
    })
  }
}
