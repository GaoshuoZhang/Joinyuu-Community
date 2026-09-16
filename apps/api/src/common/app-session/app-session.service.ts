import { Injectable } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'

interface StoredAppSession {
  jti: string
  exp: number
}

@Injectable()
export class AppSessionService {
  constructor(private readonly redis: RedisService) {}

  async add(userId: string, session: StoredAppSession): Promise<void> {
    const key = this.key(userId)
    await this.redis.hset(key, session.jti, JSON.stringify(session))
    await this.redis.expire(key, Math.max(1, session.exp - Math.floor(Date.now() / 1000)))
  }

  async remove(userId: string, jti: string): Promise<void> {
    await this.redis.hdel(this.key(userId), jti)
  }

  async kickOthers(userId: string, currentJti: string): Promise<void> {
    await this.kick(userId, currentJti)
  }

  async kickAll(userId: string): Promise<void> {
    await this.kick(userId)
  }

  private async kick(userId: string, exceptJti?: string): Promise<void> {
    const key = this.key(userId)
    const sessions = await this.redis.hgetall(key)
    const now = Math.floor(Date.now() / 1000)
    for (const [jti, raw] of Object.entries(sessions)) {
      if (jti === exceptJti) continue
      try {
        const session = JSON.parse(raw) as StoredAppSession
        if (session.exp > now) await this.redis.blacklist(jti, session.exp - now)
      } catch {
        // Corrupt session metadata is discarded below.
      } finally {
        await this.redis.hdel(key, jti)
      }
    }
  }

  private key(userId: string): string {
    return `auth:app:sessions:${userId}`
  }
}
