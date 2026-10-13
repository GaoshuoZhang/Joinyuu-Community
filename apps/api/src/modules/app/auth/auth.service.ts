import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare, hash } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { RedisService } from '../../../common/redis/redis.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { PointsEngineService } from '../../../common/engine/points-engine/points-engine.service'
import { FULL_PRICE_DISCOUNT, resolveUserPointsDiscount } from '../../../common/points/points-discount'
import { NotificationService } from '../../../common/notify/notification.service'
import { IdentityNameService } from '../../../common/identity/identity-name.service'
import { normalizeUsername } from '../../../common/identity/identity-names'
import { SmsCodeService } from '../../messaging/sms-code.service'
import { EmailCodeService, normalizeEmail } from '../../messaging/email-code.service'
import { AppSessionService } from '../../../common/app-session/app-session.service'
import { formatNow } from '../../../common/utils/time'
import { normalizeGender } from '../../../common/utils/gender'
import { BUILTIN_AGREEMENTS, BUILTIN_AGREEMENT_VERSION } from '../policies/builtin-agreements'
import { buildCaptcha } from '../../auth/captcha.util'
import type { AppJwtPayload } from '../../../common/interfaces/app-jwt-payload'
import type { RegisterDto } from './dto/register.dto'
import type { AppLoginDto } from './dto/login.dto'
import type { ResetPasswordDto, SendResetCodeDto } from './dto/reset-password.dto'
import type { ChangeEmailDto } from './dto/change-email.dto'
import type { ChangePhoneDto } from '../me/dto/change-phone.dto'

/** JWT 有效期（秒），与共享 JwtModule 的 expiresIn 2h 对齐 */
const TOKEN_TTL_SEC = 2 * 60 * 60
/** 图形验证码存储前缀（独立于 admin 的 captcha:，避免跨体系串号） */
const CAPTCHA_PREFIX = 'captcha:app:'
const CAPTCHA_TTL = 5 * 60
/** 验证码限流：同一 IP 60 秒内最多 30 次（防接口滥用） */
const CAPTCHA_RATE_MAX = 30
const CAPTCHA_RATE_WINDOW_SEC = 60
/** 登录失败锁定（与 admin 口径一致）：同一 ip+账号 连续失败 5 次锁定 15 分钟（Redis 键，多实例/重启生效） */
const LOGIN_FAIL_PREFIX = 'auth:app:login:fail:'
const LOGIN_LOCK_PREFIX = 'auth:app:login:lock:'
const LOGIN_MAX_FAILURES = 5
const LOGIN_LOCK_SEC = 15 * 60
/** 身份类型 → 展示标签（登录快照与登录态摘要用，title 缺省时兜底） */
const IDENTITY_LABEL: Record<string, string> = {
  individual: '个人用户',
  community_individual: '社区个体',
  community_enterprise: '社区企业',
  external_enterprise: '合作企业',
}

/** 登录/注册成功响应的数据形状（token + 用户快照 + 身份摘要 + 积分余额 + 积分消费折扣） */
export interface AppLoginResult {
  token: string
  uid: string
  /** 登录标识：用户可修改，全站唯一 */
  username: string
  /** 展示昵称（name 字段沿用昵称，兼容既有客户端） */
  name: string
  identities: AppIdentitySnapshot[]
  points: number
  /** 积分消费折扣：1 = 1 折 … 10 = 原价（客户端据此刻画折后价） */
  pointsDiscount: number
}

type AppIdentitySnapshot = AppJwtPayload['identities'][number]

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly ids: IdGeneratorService,
    private readonly points: PointsEngineService,
    private readonly notify: NotificationService,
    private readonly sms: SmsCodeService,
    private readonly emailCodes: EmailCodeService,
    private readonly identityNames: IdentityNameService,
    private readonly sessions: AppSessionService,
  ) {}

  /** 生成移动端图形验证码：按 IP 限流，答案存 Redis 5 分钟（独立于 admin 验证码键） */
  async generateCaptcha(ip: string): Promise<{ captchaId: string; image: string }> {
    const count = await this.redis.incrWithTtl(
      `auth:app:captcha:rate:${ip || 'unknown'}`,
      CAPTCHA_RATE_WINDOW_SEC,
    )
    if (count !== null && count > CAPTCHA_RATE_MAX) {
      throw new HttpException('操作过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    }
    const { code, image } = buildCaptcha()
    const captchaId = randomUUID()
    await this.redis.setCache(CAPTCHA_PREFIX + captchaId, code, CAPTCHA_TTL)
    return { captchaId, image }
  }

  /** 校验并一次性消费验证码（错误也消费，防自动化枚举；原子「读取-删除-比对」防并发复用） */
  private async verifyCaptcha(captchaId?: string, code?: string): Promise<boolean> {
    if (!captchaId) return false
    return this.redis.consumeAndCompare(CAPTCHA_PREFIX + captchaId, (code ?? '').toUpperCase())
  }

  /** 按登录标识（手机号 / 邮箱 / 用户名）定位账号 */
  private async findByIdentifier(identifier: string) {
    const raw = (identifier ?? '').trim()
    if (!raw) return null
    if (/^1\d{10}$/.test(raw)) {
      return this.prisma.user.findUnique({ where: { phone: raw }, include: { identities: true } })
    }
    const email = normalizeEmail(raw)
    if (email) {
      return this.prisma.user.findUnique({ where: { email }, include: { identities: true } })
    }
    const username = normalizeUsername(raw)
    return this.prisma.user.findUnique({ where: { username }, include: { identities: true } })
  }

  /** 注册：默认邮箱注册（后台已配置短信渠道时可选手机号注册）。
   * 必须验证码验证；验证后的邮箱/手机号即成为该用户的可信通知渠道；
   * 昵称与用户名由服务端自动分配（全站唯一，可后续修改）。 */
  async register(dto: RegisterDto): Promise<AppLoginResult> {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (config && config.registrationOpen === false) {
      throw new BadRequestException('注册暂未开放')
    }
    if (dto.agreed !== true) {
      throw new BadRequestException('请先阅读并同意用户协议与隐私政策')
    }

    const channel = dto.channel ?? 'email'
    const email = normalizeEmail(dto.email)
    const phone = (dto.phone ?? '').trim()

    if (channel === 'email') {
      if (!dto.email?.trim()) throw new BadRequestException('请输入邮箱')
      if (!email) throw new BadRequestException('邮箱格式不正确')
      if (!(await this.emailCodes.isAvailable())) {
        throw new BadRequestException('邮箱注册暂未开放，请稍后再试或选择手机号注册')
      }
      const ok = await this.emailCodes.verify(email, 'register', dto.code)
      if (!ok) throw new BadRequestException('邮箱验证码错误或已过期')
      const existing = await this.prisma.user.findUnique({ where: { email }, select: { uid: true } })
      if (existing) throw new ConflictException('该邮箱已注册')
    } else {
      if (!phone) throw new BadRequestException('请输入手机号')
      if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('手机号格式不正确')
      if (!(await this.sms.isAvailable())) {
        throw new BadRequestException('手机号注册暂未开放，请稍后再试')
      }
      const ok = await this.sms.verify(phone, 'register', dto.code)
      if (!ok) throw new BadRequestException('短信验证码错误或已过期')
      const existing = await this.prisma.user.findFirst({ where: { phone }, select: { uid: true } })
      if (existing) throw new ConflictException('该手机号已注册')
    }

    const uid = await this.ids.next('U')
    const username = await this.identityNames.assignUsername()
    const nickname = await this.identityNames.assignNickname()
    const now = formatNow()
    const agreements = await this.prisma.policy.findMany({
      where: { kind: { in: ['agreement_user', 'agreement_privacy'] }, status: 'published' },
      orderBy: { publishedAt: 'desc' },
    })
    const agreementVersions = new Map<string, string>()
    for (const policy of agreements) {
      if (!agreementVersions.has(policy.kind)) agreementVersions.set(policy.kind, policy.version)
    }
    /* 正式部署未导入种子/未发布协议时回退内置 V1.0（与 /api/app/policies/:kind 口径一致），保证注册不被阻断 */
    for (const builtin of Object.values(BUILTIN_AGREEMENTS)) {
      if (!agreementVersions.has(builtin.policyKind)) agreementVersions.set(builtin.policyKind, BUILTIN_AGREEMENT_VERSION)
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            uid,
            username,
            nickname,
            phone: channel === 'phone' ? phone : null,
            email: channel === 'email' ? email : null,
            /* 注册验证通过即视为可信通知渠道 */
            phoneVerifiedAt: channel === 'phone' ? now : null,
            emailVerifiedAt: channel === 'email' ? now : null,
            gender: normalizeGender(dto.gender),
            status: 'active',
            passwordHash: await hash(dto.password, 10),
            points: 0,
            registeredAt: now,
            lastActiveAt: now,
            bio: '',
            identities: {
              create: { type: 'individual', title: '个人用户' },
            },
          },
        })
        await tx.agreementConsent.createMany({
          data: [
            ['user_agreement', 'agreement_user'],
            ['privacy_policy', 'agreement_privacy'],
          ].map(([agreementType, policyKind]) => ({
            userId: uid,
            agreementType,
            version: agreementVersions.get(policyKind)!,
            consentedAt: now,
          })),
        })
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(channel === 'email' ? '该邮箱已注册' : '该手机号已注册')
      }
      throw error
    }

    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '欢迎加入聚屿社区',
      content: `注册成功，你的用户名是 ${username}，开始探索社区服务吧。`,
    })

    const token = await this.signToken(uid, nickname, [{ type: 'individual', label: '个人用户' }])
    return {
      token,
      uid,
      username,
      name: nickname,
      identities: [{ type: 'individual', label: '个人用户' }],
      points: 0,
      /* 新用户无社区个体等级：按原价 */
      pointsDiscount: FULL_PRICE_DISCOUNT,
    }
  }

  /** 登录：校验图形验证码 → 失败锁定检查 → 按 手机号/邮箱/用户名 定位账号 → 校验密码与状态 → 签发多身份 app JWT */
  async login(dto: AppLoginDto, ip: string): Promise<AppLoginResult> {
    const captchaOk = await this.verifyCaptcha(dto.captchaId, dto.captchaCode)
    if (!captchaOk) throw new BadRequestException('验证码错误或已过期')

    /* 账号级失败锁定：标识归一化（去空格+小写），防大小写变体绕过失败计数 */
    const rateKey = `${ip}:${(dto.identifier ?? '').trim().toLowerCase()}`
    const lock = await this.redis.getCache<{ until: number }>(LOGIN_LOCK_PREFIX + rateKey)
    if (lock && lock.until > Date.now()) {
      const minutes = Math.ceil((lock.until - Date.now()) / 60000)
      throw new HttpException(`登录失败次数过多，请 ${minutes} 分钟后再试`, HttpStatus.TOO_MANY_REQUESTS)
    }

    const user = await this.findByIdentifier(dto.identifier)
    if (!user || !user.passwordHash || !(await compare(dto.password, user.passwordHash))) {
      const current = (await this.redis.getCache<{ count: number }>(LOGIN_FAIL_PREFIX + rateKey))?.count ?? 0
      const count = current + 1
      if (count >= LOGIN_MAX_FAILURES) {
        await this.redis.setCache(
          LOGIN_LOCK_PREFIX + rateKey,
          { until: Date.now() + LOGIN_LOCK_SEC * 1000 },
          LOGIN_LOCK_SEC,
        )
        await this.redis.delCache(LOGIN_FAIL_PREFIX + rateKey)
      } else {
        await this.redis.setCache(LOGIN_FAIL_PREFIX + rateKey, { count }, LOGIN_LOCK_SEC)
      }
      throw new UnauthorizedException('账号或密码错误')
    }
    await this.redis.delCache(LOGIN_FAIL_PREFIX + rateKey)
    if (user.status === 'frozen') throw new UnauthorizedException('账号已冻结，请联系社区运营')
    if (user.status !== 'active') throw new UnauthorizedException('账号已注销或停用，请联系社区运营')

    await this.prisma.user.update({ where: { uid: user.uid }, data: { lastActiveAt: formatNow() } })

    const identities: AppIdentitySnapshot[] = user.identities.map((i) => ({
      type: i.type,
      label: i.title || this.identityLabel(i.type),
      level: i.level ?? undefined,
      experience: i.experience ?? undefined,
      enterpriseId: i.enterpriseId ?? undefined,
      enterpriseName: i.enterpriseName ?? undefined,
      enterpriseRole: i.role ?? undefined,
    }))

    const token = await this.signToken(user.uid, user.nickname, identities)

    /* 每日登录积分：自然日去重（当天已发则不重复发放）；失败仅告警，不阻断登录主流程 */
    try {
      const today = formatNow().slice(0, 10)
      await this.points.issuePoints(user.uid, 'daily_login', '每日登录', `daily_login:${user.uid}:${today}`)
    } catch (e) {
      console.error('[app-auth] 每日登录积分发放失败（忽略）:', e instanceof Error ? e.message : e)
    }

    const fresh = await this.prisma.user.findUnique({ where: { uid: user.uid }, select: { points: true } })
    return {
      token,
      uid: user.uid,
      username: user.username,
      name: user.nickname,
      identities,
      points: fresh?.points ?? 0,
      pointsDiscount: await resolveUserPointsDiscount(this.prisma, user.uid),
    }
  }

  /** 登出：jti 加入黑名单（剩余有效期），token 即时失效 */
  async logout(payload: AppJwtPayload): Promise<{ code: number }> {
    const exp = payload.exp ?? Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
    const remaining = exp - Math.floor(Date.now() / 1000)
    await this.redis.blacklist(payload.jti, remaining)
    await this.sessions.remove(payload.sub, payload.jti)
    return { code: 0 }
  }

  /** 找回密码前置：返回该账号已验证的可信验证渠道（脱敏），供客户端选择用哪种方式收码 */
  async recoveryChannels(identifier: string): Promise<{ email: string | null; phone: string | null }> {
    const user = await this.findByIdentifier(identifier)
    if (!user) throw new BadRequestException('该账号未注册')
    return {
      email: user.email && user.emailVerifiedAt ? maskEmail(user.email) : null,
      phone: user.phone && user.phoneVerifiedAt ? maskPhone(user.phone) : null,
    }
  }

  /** 找回密码发码：解析账号已验证的可信渠道，向该渠道真实地址下发验证码（客户端只传账号标识） */
  async sendResetCode(
    dto: SendResetCodeDto,
    context: { ip?: string; deviceId?: string } = {},
  ): Promise<{ expiresInSec: number; devCode?: string }> {
    const user = await this.findByIdentifier(dto.identifier)
    if (!user) throw new BadRequestException('该账号未注册')

    if (dto.channel === 'email') {
      if (!user.email || !user.emailVerifiedAt) {
        throw new BadRequestException('该账号未绑定已验证的邮箱，无法通过邮箱验证')
      }
      return this.emailCodes.send(user.email, 'reset_password', context)
    }
    if (!user.phone || !user.phoneVerifiedAt) {
      throw new BadRequestException('该账号未绑定已验证的手机号，无法通过短信验证')
    }
    return this.sms.send(user.phone, 'reset_password', context)
  }

  /** 找回密码：必须使用可信通知渠道验证 → 更新密码 → 全端登出 → 站内信通知 */
  async resetPassword(dto: ResetPasswordDto): Promise<{ code: number }> {
    const attempts = await this.redis.incrWithTtl(`auth:app:reset:rate:${dto.identifier.trim()}`, 15 * 60)
    if (attempts !== null && attempts > 5) {
      throw new HttpException('操作过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    }

    const user = await this.findByIdentifier(dto.identifier)
    /* D-105：未注册账号是业务校验失败而非登录失效，用 400 避免触发客户端全局 401 登出跳转 */
    if (!user) throw new BadRequestException('该账号未注册')

    if (dto.channel === 'email') {
      if (!user.email || !user.emailVerifiedAt) {
        throw new BadRequestException('该账号未绑定已验证的邮箱，无法通过邮箱验证')
      }
      const ok = await this.emailCodes.verify(user.email, 'reset_password', dto.code)
      if (!ok) throw new BadRequestException('邮箱验证码错误或已过期')
    } else {
      if (!user.phone || !user.phoneVerifiedAt) {
        throw new BadRequestException('该账号未绑定已验证的手机号，无法通过短信验证')
      }
      const ok = await this.sms.verify(user.phone, 'reset_password', dto.code)
      if (!ok) throw new BadRequestException('短信验证码错误或已过期')
    }

    await this.prisma.user.update({
      where: { uid: user.uid },
      data: { passwordHash: await hash(dto.newPassword, 10), passwordUpdatedAt: formatNow() },
    })
    await this.sessions.kickAll(user.uid)

    await this.notify.pushNotice(user.uid, {
      type: 'system',
      title: '密码已重置',
      content: '您的登录密码已重置成功，请使用新密码登录。',
    })
    return { code: 0 }
  }

  /** 绑定/更换绑定手机号：须验证新手机号（短信验证码）→ 占用校验 → 更新并标记为可信渠道 */
  async changePhone(uid: string, dto: ChangePhoneDto): Promise<{ code: number }> {
    const newPhone = dto.newPhone.trim()
    if (!/^1\d{10}$/.test(newPhone)) throw new BadRequestException('手机号格式不正确')
    if (!(await this.sms.isAvailable())) throw new BadRequestException('短信通道未启用，无法验证手机号')
    const ok = await this.sms.verify(newPhone, 'change_phone', dto.smsCode)
    if (!ok) throw new BadRequestException('短信验证码错误或已过期')

    const conflict = await this.prisma.user.findUnique({ where: { phone: newPhone }, select: { uid: true } })
    if (conflict && conflict.uid !== uid) throw new ConflictException('该手机号已绑定其他账号')

    await this.prisma.user.update({
      where: { uid },
      data: { phone: newPhone, phoneVerifiedAt: formatNow() },
    })
    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '手机号已绑定',
      content: '您绑定的手机号已更新成功，可用于登录与接收通知。',
    })
    return { code: 0 }
  }

  /** 绑定/更换绑定邮箱：须验证新邮箱（邮箱验证码）→ 占用校验 → 更新并标记为可信渠道 */
  async changeEmail(uid: string, dto: ChangeEmailDto): Promise<{ code: number }> {
    const newEmail = normalizeEmail(dto.newEmail)
    if (!newEmail) throw new BadRequestException('邮箱格式不正确')
    if (!(await this.emailCodes.isAvailable())) throw new BadRequestException('邮箱通道未启用，无法验证邮箱')
    const ok = await this.emailCodes.verify(newEmail, 'change_email', dto.code)
    if (!ok) throw new BadRequestException('邮箱验证码错误或已过期')

    const conflict = await this.prisma.user.findUnique({ where: { email: newEmail }, select: { uid: true } })
    if (conflict && conflict.uid !== uid) throw new ConflictException('该邮箱已绑定其他账号')

    await this.prisma.user.update({
      where: { uid },
      data: { email: newEmail, emailVerifiedAt: formatNow() },
    })
    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '邮箱已绑定',
      content: '您绑定的邮箱已更新成功，可用于登录与接收通知。',
    })
    return { code: 0 }
  }

  /* ---------- 内部工具 ---------- */

  private identityLabel(type: string): string {
    return IDENTITY_LABEL[type] || type
  }

  /** 签发 app 域 JWT（payload：sub=uid / name / scope='app' / identities 快照 / jti） */
  private async signToken(
    uid: string,
    name: string,
    identities: AppIdentitySnapshot[],
  ): Promise<string> {
    const jti = randomUUID()
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
    const payload: AppJwtPayload = { sub: uid, name, scope: 'app', identities, jti }
    const token = await this.jwt.signAsync(payload)
    await this.sessions.add(uid, { jti, exp })
    return token
  }
}

/** 邮箱脱敏：a***@domain */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!domain) return '***'
  return `${name.slice(0, 1)}***@${domain}`
}

/** 手机号脱敏：138****0000 */
function maskPhone(phone: string): string {
  if (!/^\d{11}$/.test(phone)) return '***'
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}
