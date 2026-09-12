import { Injectable, NotFoundException } from '@nestjs/common'
import { RedisService } from '../../common/redis/redis.service'

const SESSIONS_KEY = 'auth:admin:sessions'
/** 会话索引 TTL（2h，与 JWT 有效期一致；add 时刷新，移除单个会话不影响整体） */
const SESSIONS_TTL = 2 * 60 * 60

export interface AdminSessionDto {
  jti: string
  username: string
  name: string
  ip: string
  device: string
  loginAt: string
}

interface StoredSession extends AdminSessionDto {
  /** 令牌过期时间（Unix 秒） */
  exp: number
}

/* 在线会话：Redis Hash 维护全部在线会话（field = jti，value = 会话 JSON）。
 * 单会话读改写（HSET/HDEL）互不干扰，消除原 JSON 数组全量读-改-写竞态。
 * 强制下线/改密 → 黑名单 jti + 移出索引，令牌即时失效。 */
@Injectable()
export class AdminSessionService {
  constructor(private readonly redis: RedisService) {}

  async add(session: StoredSession): Promise<void> {
    await this.redis.hset(SESSIONS_KEY, session.jti, JSON.stringify(session))
    await this.redis.expire(SESSIONS_KEY, SESSIONS_TTL)
  }

  /** 在线会话列表（过滤并清理已过期/损坏项） */
  async list(): Promise<AdminSessionDto[]> {
    const now = Math.floor(Date.now() / 1000)
    const all = await this.redis.hgetall(SESSIONS_KEY)
    const alive: AdminSessionDto[] = []
    const stale: string[] = []
    for (const [jti, raw] of Object.entries(all)) {
      const session = this.parse(raw)
      if (!session || session.exp <= now) {
        stale.push(jti)
        continue
      }
      alive.push({
        jti: session.jti,
        username: session.username,
        name: session.name,
        ip: session.ip,
        device: session.device,
        loginAt: session.loginAt,
      })
    }
    if (stale.length > 0) await this.redis.hdel(SESSIONS_KEY, ...stale)
    return alive
  }

  /** 登出：仅移出索引（黑名单由调用方处理） */
  async remove(jti: string): Promise<void> {
    await this.redis.hdel(SESSIONS_KEY, jti)
  }

  /** 强制下线指定会话（黑名单 + 移出索引）；目标不存在时 404（避免静默失效） */
  async kick(jti: string): Promise<{ code: number }> {
    const raw = await this.redis.hget(SESSIONS_KEY, jti)
    if (raw == null) throw new NotFoundException('会话不存在或已下线')
    const target = this.parse(raw)
    if (target) await this.blacklistIfAlive(target)
    await this.redis.hdel(SESSIONS_KEY, jti)
    return { code: 0 }
  }

  /** 强制下线某账号全部会话（重置密码 / 停用账号） */
  async kickByUsername(username: string): Promise<void> {
    const all = await this.redis.hgetall(SESSIONS_KEY)
    const targets: StoredSession[] = []
    const fields: string[] = []
    for (const [jti, raw] of Object.entries(all)) {
      const session = this.parse(raw)
      if (session && session.username === username) {
        targets.push(session)
        fields.push(jti)
      }
    }
    if (fields.length === 0) return
    for (const t of targets) await this.blacklistIfAlive(t)
    await this.redis.hdel(SESSIONS_KEY, ...fields)
  }

  /** 一键强制下线：除保留会话（当前操作者）外全部下线（黑名单 + 移出索引），返回实际下线数 */
  async kickAll(keepJti?: string): Promise<{ code: number; kicked: number }> {
    const all = await this.redis.hgetall(SESSIONS_KEY)
    const alive: string[] = []
    const stale: string[] = []
    for (const [jti, raw] of Object.entries(all)) {
      if (keepJti && jti === keepJti) continue
      const session = this.parse(raw)
      if (!session) {
        stale.push(jti)
        continue
      }
      await this.blacklistIfAlive(session)
      alive.push(jti)
    }
    const remove = [...alive, ...stale]
    if (remove.length > 0) await this.redis.hdel(SESSIONS_KEY, ...remove)
    return { code: 0, kicked: alive.length }
  }

  private parse(raw: string): StoredSession | null {
    try {
      return JSON.parse(raw) as StoredSession
    } catch {
      return null
    }
  }

  private async blacklistIfAlive(session: StoredSession): Promise<void> {
    const remaining = session.exp - Math.floor(Date.now() / 1000)
    if (remaining > 0) await this.redis.blacklist(session.jti, remaining)
  }
}
