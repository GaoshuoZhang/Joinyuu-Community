import { Injectable, NotFoundException } from '@nestjs/common'
import { RedisService } from '../../common/redis/redis.service'

const SESSIONS_KEY = 'auth:admin:sessions'
/** 会话索引 TTL（2h，与 JWT 有效期一致；每次写入刷新） */
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

/* 在线会话：Redis 单键维护全部在线会话（管理员量级小）。
 * 强制下线/改密 → 黑名单 jti + 移出索引，令牌即时失效。 */
@Injectable()
export class AdminSessionService {
  constructor(private readonly redis: RedisService) {}

  async add(session: StoredSession): Promise<void> {
    const list = await this.readAll()
    list.push(session)
    await this.writeAll(list)
  }

  /** 在线会话列表（过滤已过期） */
  async list(): Promise<AdminSessionDto[]> {
    const now = Math.floor(Date.now() / 1000)
    const list = await this.readAll()
    return list
      .filter((s) => s.exp > now)
      .map((s) => ({
        jti: s.jti,
        username: s.username,
        name: s.name,
        ip: s.ip,
        device: s.device,
        loginAt: s.loginAt,
      }))
  }

  /** 登出：仅移出索引（黑名单由调用方处理） */
  async remove(jti: string): Promise<void> {
    const list = await this.readAll()
    const next = list.filter((s) => s.jti !== jti)
    if (next.length !== list.length) await this.writeAll(next)
  }

  /** 强制下线指定会话（黑名单 + 移出索引）；目标不存在时 404（避免静默失效） */
  async kick(jti: string): Promise<{ code: number }> {
    const list = await this.readAll()
    const target = list.find((s) => s.jti === jti)
    if (!target) throw new NotFoundException('会话不存在或已下线')
    await this.blacklistIfAlive(target)
    await this.writeAll(list.filter((s) => s.jti !== jti))
    return { code: 0 }
  }

  /** 强制下线某账号全部会话（重置密码 / 停用账号） */
  async kickByUsername(username: string): Promise<void> {
    const list = await this.readAll()
    const targets = list.filter((s) => s.username === username)
    if (targets.length === 0) return
    for (const t of targets) await this.blacklistIfAlive(t)
    await this.writeAll(list.filter((s) => s.username !== username))
  }

  private async blacklistIfAlive(session: StoredSession): Promise<void> {
    const remaining = session.exp - Math.floor(Date.now() / 1000)
    if (remaining > 0) await this.redis.blacklist(session.jti, remaining)
  }

  private async readAll(): Promise<StoredSession[]> {
    return (await this.redis.getCache<StoredSession[]>(SESSIONS_KEY)) ?? []
  }

  private async writeAll(list: StoredSession[]): Promise<void> {
    await this.redis.setCache(SESSIONS_KEY, list, SESSIONS_TTL)
  }
}
