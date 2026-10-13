import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare, hash } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../common/prisma/prisma.service'
import { RedisService } from '../../common/redis/redis.service'
import { captchaRateKey, passwordExpiredKey } from '../../common/redis/cache-keys'
import { AuditService } from '../../common/audit/audit.service'
import { AdminPermissionService } from '../../common/rbac/admin-permission.service'
import { formatNow } from '../../common/utils/time'
import { LoginLogService } from '../system/login-logs/login-log.service'
import { AdminSessionService, type AdminSessionDto } from './admin-session.service'
import { buildCaptcha } from './captcha.util'
import type { AdminJwtPayload } from '../../common/interfaces/admin-jwt-payload'

/** JWT 有效期（秒），与 JwtModule expiresIn 2h 保持一致 */
const TOKEN_TTL_SEC = 2 * 60 * 60
const CAPTCHA_PREFIX = 'captcha:'
const CAPTCHA_TTL = 5 * 60
/** 登录失败限速：同一 ip+username 连续失败 5 次锁定 15 分钟（Redis 键，多实例/重启生效） */
const FAIL_PREFIX = 'auth:login:fail:'
const LOCK_PREFIX = 'auth:login:lock:'
const LOGIN_MAX_FAILURES = 5
const LOGIN_LOCK_SEC = 15 * 60
/** 验证码限流：同一 IP 60 秒内最多 30 次（防接口滥用） */
const CAPTCHA_RATE_MAX = 30
const CAPTCHA_RATE_WINDOW_SEC = 60
/** 密码过期标记 TTL（秒），与 JWT 有效期一致 */
const PWD_EXPIRED_TTL = TOKEN_TTL_SEC
/** 账号不存在时也执行一次 bcrypt 比较，抹平登录响应的用户存在性时间侧信道 */
const DUMMY_PASSWORD_HASH = '$2b$10$L20rudETk1Q2kkxvL0qY.esJFfCsn2pwmKfgawCqy34hp8jtwMUWC'

export interface LoginContext {
  ip: string
  device: string
  captchaId?: string
  captchaCode?: string
}

export interface LoginResult {
  token: string
  name: string
  permissions: string[]
  /** 数据范围域集合（空数组 = 不限制全部域；超管为空数组） */
  dataScope: string[]
  /** 密码已过期（登录仍成功，但除白名单接口外均被守卫拦截，改密后解除） */
  passwordExpired: boolean
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly permissions: AdminPermissionService,
    private readonly sessions: AdminSessionService,
    private readonly loginLogs: LoginLogService,
  ) {}

  /** 生成图形验证码：先按 IP 限流（60s 内最多 30 次），答案存 Redis 5 分钟 */
  async generateCaptcha(ip: string): Promise<{ captchaId: string; image: string }> {
    const count = await this.redis.incrWithTtl(captchaRateKey(ip || 'unknown'), CAPTCHA_RATE_WINDOW_SEC)
    if (count !== null && count > CAPTCHA_RATE_MAX) {
      throw new HttpException('操作过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    }
    const { code, image } = buildCaptcha()
    const captchaId = randomUUID()
    await this.redis.setCache(CAPTCHA_PREFIX + captchaId, code, CAPTCHA_TTL)
    return { captchaId, image }
  }

  private async verifyCaptcha(captchaId: string, captchaCode: string): Promise<boolean> {
    /* 原子「读取-删除-比对」：并发下同一验证码不会被两个请求同时校验通过；错误也消费，防同 ID 反复爆破 */
    return this.redis.consumeAndCompare(
      CAPTCHA_PREFIX + captchaId,
      (captchaCode ?? '').toUpperCase(),
    )
  }

  async login(username: string, password: string, ctx: LoginContext): Promise<LoginResult> {
    /* 图形验证码：服务端强制校验（加固：防自动化撞库；一次性消费，错误也消费） */
    const captchaOk = await this.verifyCaptcha(ctx.captchaId ?? '', ctx.captchaCode ?? '')
    if (!captchaOk) {
      await this.loginLogs.record({
        username,
        ip: ctx.ip,
        device: ctx.device,
        status: 'fail',
        failReason: '验证码错误',
      })
      throw new BadRequestException('验证码错误或已过期')
    }

    const rateKey = `${ctx.ip}:${username}`
    const lock = await this.redis.getCache<{ until: number }>(LOCK_PREFIX + rateKey)
    if (lock && lock.until > Date.now()) {
      const minutes = Math.ceil((lock.until - Date.now()) / 60000)
      await this.loginLogs.record({
        username,
        ip: ctx.ip,
        device: ctx.device,
        status: 'locked',
        failReason: '登录失败次数过多',
      })
      throw new HttpException(`登录失败次数过多，请 ${minutes} 分钟后再试`, HttpStatus.TOO_MANY_REQUESTS)
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { username } })
    const passwordOk = await compare(password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH)
    if (!admin || !passwordOk) {
      const current = (await this.redis.getCache<{ count: number }>(FAIL_PREFIX + rateKey))?.count ?? 0
      const count = current + 1
      if (count >= LOGIN_MAX_FAILURES) {
        await this.redis.setCache(
          LOCK_PREFIX + rateKey,
          { until: Date.now() + LOGIN_LOCK_SEC * 1000 },
          LOGIN_LOCK_SEC,
        )
        await this.redis.delCache(FAIL_PREFIX + rateKey)
      } else {
        await this.redis.setCache(FAIL_PREFIX + rateKey, { count }, LOGIN_LOCK_SEC)
      }
      await this.loginLogs.record({
        username,
        ip: ctx.ip,
        device: ctx.device,
        status: 'fail',
        failReason: '账号或密码错误',
      })
      throw new UnauthorizedException('账号或密码错误，请重新输入')
    }

    if (admin.status !== 'active') {
      await this.loginLogs.record({
        username,
        ip: ctx.ip,
        device: ctx.device,
        status: 'fail',
        failReason: '账号已停用',
      })
      throw new UnauthorizedException('账号已停用，请联系超级管理员')
    }

    /* 登录成功清除失败计数与锁定 */
    await this.redis.delCache(FAIL_PREFIX + rateKey, LOCK_PREFIX + rateKey)

    /* 密码周期：超期仍放行登录，但写过期标记，守卫仅放行改密/登出等白名单接口 */
    const passwordExpired = await this.isPasswordExpired(admin)
    if (passwordExpired) {
      await this.redis.setFlag(passwordExpiredKey(admin.username), PWD_EXPIRED_TTL)
    } else {
      await this.redis.delCache(passwordExpiredKey(admin.username))
    }

    const jti = randomUUID()
    const permissions = await this.permissions.getPermCodes(username)
    const dataScope = await this.permissions.getScopeCodes(username)
    const payload: AdminJwtPayload = { sub: admin.username, name: admin.name, jti }
    const token = await this.jwt.signAsync(payload)

    const loginAt = formatNow()
    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: loginAt } })
    await this.sessions.add({
      jti,
      username: admin.username,
      name: admin.name,
      ip: ctx.ip,
      device: ctx.device,
      loginAt,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
    })
    await this.loginLogs.record({
      username: admin.username,
      ip: ctx.ip,
      device: ctx.device,
      status: 'success',
    })

    return { token, name: admin.name, permissions, dataScope, passwordExpired }
  }

  /** 密码是否已过期：仅在 SystemConfig.passwordExpireEnabled=true（密码过期强制改密，仅后台账号）时按
   * passwordExpireDays 计算；开关关闭（默认）、无时间戳、时间戳不可解析 → 不过期 */
  private async isPasswordExpired(admin: { passwordUpdatedAt: string | null }): Promise<boolean> {
    if (!admin.passwordUpdatedAt) return false
    const config = await this.prisma.systemConfig.findUnique({
      where: { id: 1 },
      select: { passwordExpireEnabled: true, passwordExpireDays: true },
    })
    if (!config?.passwordExpireEnabled) return false
    const days = config.passwordExpireDays
    if (days <= 0) return false
    const updated = new Date(admin.passwordUpdatedAt.replace(' ', 'T'))
    if (Number.isNaN(updated.getTime())) return false
    return Date.now() - updated.getTime() > days * 24 * 60 * 60 * 1000
  }

  async logout(payload: AdminJwtPayload): Promise<{ code: number }> {
    const exp = payload.exp ?? Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
    const remaining = exp - Math.floor(Date.now() / 1000)
    await this.redis.blacklist(payload.jti, remaining)
    await this.sessions.remove(payload.jti)
    return { code: 0 }
  }

  /** 修改密码：校验原密码 → 更新 → 失效权限缓存 → 强制下线全部会话 */
  async changePassword(
    username: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ code: number }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { username } })
    if (!admin) throw new UnauthorizedException('未登录或登录已过期')
    if (!(await compare(oldPassword, admin.passwordHash))) {
      throw new BadRequestException('原密码不正确')
    }
    if (oldPassword === newPassword) {
      throw new BadRequestException('新密码不能与原密码相同')
    }
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: await hash(newPassword, 10), passwordUpdatedAt: formatNow() },
    })
    await this.redis.delCache(passwordExpiredKey(username))
    await this.permissions.invalidate(username)
    await this.sessions.kickByUsername(username)
    await this.audit.record({ module: '认证', action: '修改密码', target: username, operator: username })
    return { code: 0 }
  }

  listSessions(): Promise<AdminSessionDto[]> {
    return this.sessions.list()
  }

  kickSession(jti: string): Promise<{ code: number }> {
    return this.sessions.kick(jti)
  }
}
