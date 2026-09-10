import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../common/prisma/prisma.service'
import { RedisService } from '../../common/redis/redis.service'
import type { AdminJwtPayload } from '../../common/interfaces/admin-jwt-payload'

@Injectable()
export class AuthService {
  /* 登录失败限速（单实例内存固定窗口）：同一 ip+username 连续失败 5 次锁定 15 分钟 */
  private static readonly MAX_FAILURES = 5
  private static readonly LOCK_WINDOW_MS = 15 * 60 * 1000
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  async login(username: string, password: string, ip = ''): Promise<{ token: string; name: string }> {
    const key = `${ip}:${username}`
    const record = this.failures.get(key)
    if (record && record.lockedUntil > Date.now()) {
      const minutes = Math.ceil((record.lockedUntil - Date.now()) / 60000)
      throw new HttpException(`登录失败次数过多，请 ${minutes} 分钟后再试`, HttpStatus.TOO_MANY_REQUESTS)
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { username } })
    if (!admin || !(await compare(password, admin.passwordHash))) {
      const current = this.failures.get(key)
      const count = (current?.count ?? 0) + 1
      if (count >= AuthService.MAX_FAILURES) {
        this.failures.set(key, { count, lockedUntil: Date.now() + AuthService.LOCK_WINDOW_MS })
      } else {
        this.failures.set(key, { count, lockedUntil: 0 })
      }
      throw new UnauthorizedException('账号或密码错误，请重新输入')
    }

    /* 登录成功清除失败计数 */
    this.failures.delete(key)

    const payload: AdminJwtPayload = { sub: admin.username, name: admin.name, jti: randomUUID() }
    const token = await this.jwt.signAsync(payload)
    return { token, name: admin.name }
  }

  async logout(payload: AdminJwtPayload): Promise<{ code: number }> {
    const exp = payload.exp ?? Math.floor(Date.now() / 1000) + 2 * 60 * 60
    const remaining = exp - Math.floor(Date.now() / 1000)
    await this.redis.blacklist(payload.jti, remaining)
    return { code: 0 }
  }
}
