import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../common/prisma/prisma.service'
import { RedisService } from '../../common/redis/redis.service'
import type { AdminJwtPayload } from '../../common/interfaces/admin-jwt-payload'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  async login(username: string, password: string): Promise<{ token: string; name: string }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { username } })
    if (!admin || !(await compare(password, admin.passwordHash))) {
      throw new UnauthorizedException('账号或密码错误，请重新输入')
    }
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
