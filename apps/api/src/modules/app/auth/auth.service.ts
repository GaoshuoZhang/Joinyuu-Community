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
import { Prisma, type User, type UserIdentity } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { RedisService } from '../../../common/redis/redis.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { PointsEngineService } from '../../../common/engine/points-engine/points-engine.service'
import { FULL_PRICE_DISCOUNT, resolveUserPointsDiscount } from '../../../common/points/points-discount'
import { NotificationService } from '../../../common/notify/notification.service'
import { IdentityNameService } from '../../../common/identity/identity-name.service'
import { SmsCodeService } from '../../messaging/sms-code.service'
import { EmailCodeService, normalizeEmail } from '../../messaging/email-code.service'
import { AppSessionService } from '../../../common/app-session/app-session.service'
import { LicenseService } from '../../../common/license/license.service'
import { formatNow } from '../../../common/utils/time'
import { normalizeGender } from '../../../common/utils/gender'
import { BUILTIN_AGREEMENTS, BUILTIN_AGREEMENT_VERSION } from '../policies/builtin-agreements'
import { buildCaptcha } from '../../auth/captcha.util'
import { parseIdentifier } from './identifier.util'
import type { AppJwtPayload } from '../../../common/interfaces/app-jwt-payload'
import type { RegisterDto } from './dto/register.dto'
import type { AppLoginDto } from './dto/login.dto'
import type { LoginByCodeDto } from './dto/login-by-code.dto'
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
const LOGIN_FAIL_PREFIX = 'auth:app:login:attempts:v2:'
const LOGIN_LOCK_PREFIX = 'auth:app:login:lock:'
const LOGIN_MAX_FAILURES = 5
const CAPTCHA_AFTER_FAILURES = 3
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

/** 按标识定位到的账号（含身份列表）：登录收尾与渠道补验的入参形状 */
type IdentifiedUser = User & { identities: UserIdentity[] }

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
    private readonly license: LicenseService,
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

  /** 按登录标识（手机号 / 邮箱 / 用户名）定位账号；形态判定统一走 parseIdentifier（与客户端同口径） */
  private async findByIdentifier(identifier: string) {
    const parsed = parseIdentifier(identifier)
    if (!parsed) return null
    const include = { identities: true } as const
    if (parsed.kind === 'phone') {
      return this.prisma.user.findUnique({ where: { phone: parsed.value }, include })
    }
    if (parsed.kind === 'email') {
      return this.prisma.user.findUnique({ where: { email: parsed.value }, include })
    }
    return this.prisma.user.findUnique({ where: { username: parsed.value }, include })
  }

  /** 注册：邮箱/手机号验证码注册（默认邮箱；后台已配置短信渠道时可选手机号注册），
   * 以及双通道都不可用时的兜底「用户名 + 密码」注册（channel='username'）。
   * 验证码渠道通过验证即成为该用户的可信通知渠道；昵称由服务端自动分配（全站唯一，可后续修改），
   * 用户名默认自动分配，username 渠道则由用户指定。 */
  async register(dto: RegisterDto): Promise<AppLoginResult> {
    if (!(await this.registrationOpen())) {
      throw new BadRequestException('注册暂未开放')
    }
    if (dto.agreed !== true) {
      throw new BadRequestException('请先阅读并同意用户协议与隐私政策')
    }

    const channel = dto.channel ?? 'email'
    const email = normalizeEmail(dto.email)
    const phone = (dto.phone ?? '').trim()
    /* 按渠道确定账号字段与可信渠道；username 渠道是兜底路径（无验证码、无可信通知渠道） */
    let username: string | null = null
    let verifiedChannel: 'phone' | 'email' | null
    if (channel === 'username') {
      /* 兜底渠道：只在短信与邮箱通道**都不可用**时开放（与客户端入口口径一致）。
       * 该渠道无验证码，若常开等于零成本批量注册——其余渠道都必须先通过验证码，是注册的唯一滥用闸门。 */
      const [smsReady, emailReady] = await Promise.all([
        this.sms.isAvailable(),
        this.emailCodes.isAvailable(),
      ])
      if (smsReady || emailReady) {
        throw new BadRequestException('用户名注册仅在短信与邮箱通道均不可用时可用，请使用验证码方式注册')
      }
      username = await this.identityNames.assertUsernameAvailable(dto.username ?? '')
      verifiedChannel = null
    } else if (channel === 'email') {
      if (!dto.email?.trim()) throw new BadRequestException('请输入邮箱')
      if (!email) throw new BadRequestException('邮箱格式不正确')
      if (!(await this.emailCodes.isAvailable())) {
        throw new BadRequestException('邮箱注册暂未开放，请稍后再试或选择手机号注册')
      }
      if (!dto.code) throw new BadRequestException('请输入验证码')
      const ok = await this.emailCodes.verify(email, 'register', dto.code)
      if (!ok) throw new BadRequestException('邮箱验证码错误或已过期')
      const existing = await this.prisma.user.findUnique({ where: { email }, select: { uid: true } })
      if (existing) throw new ConflictException('该邮箱已注册')
      verifiedChannel = 'email'
    } else {
      if (!phone) throw new BadRequestException('请输入手机号')
      if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('手机号格式不正确')
      if (!(await this.sms.isAvailable())) {
        throw new BadRequestException('手机号注册暂未开放，请稍后再试')
      }
      if (!dto.code) throw new BadRequestException('请输入验证码')
      const ok = await this.sms.verify(phone, 'register', dto.code)
      if (!ok) throw new BadRequestException('短信验证码错误或已过期')
      const existing = await this.prisma.user.findFirst({ where: { phone }, select: { uid: true } })
      if (existing) throw new ConflictException('该手机号已注册')
      verifiedChannel = 'phone'
    }

    let created: { uid: string; username: string; nickname: string }
    try {
      created = await this.createUserAccount({
        username,
        phone: verifiedChannel === 'phone' ? phone : null,
        email: verifiedChannel === 'email' ? email : null,
        verifiedChannel,
        passwordHash: await hash(dto.password, 10),
        gender: dto.gender,
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          channel === 'email' ? '该邮箱已注册' : channel === 'phone' ? '该手机号已注册' : '该用户名已被占用',
        )
      }
      throw error
    }

    const token = await this.signToken(created.uid, created.nickname, [{ type: 'individual', label: '个人用户' }])
    return {
      token,
      uid: created.uid,
      username: created.username,
      name: created.nickname,
      identities: [{ type: 'individual', label: '个人用户' }],
      points: 0,
      /* 新用户无社区个体等级：按原价 */
      pointsDiscount: FULL_PRICE_DISCOUNT,
    }
  }

  /** 登录：连续三次密码失败后要求图形验证码，再校验账号密码并签发多身份 app JWT */
  async login(dto: AppLoginDto, ip: string): Promise<AppLoginResult> {
    /* 账号级失败锁定：key 必须与账号定位同口径（parseIdentifier：去分隔符/去 +86/统一大小写），
     * 否则同一账号的 `138 0121 0001`、`+8613801210001` 等变体各占一份计数，可绕过失败锁定 */
    const rateKey = `${ip}:${normalizedRateIdentifier(dto.identifier)}`
    const failedAttempts = await this.redis.getCache<number>(LOGIN_FAIL_PREFIX + rateKey) ?? 0
    const captchaRequired = failedAttempts >= CAPTCHA_AFTER_FAILURES
    if (captchaRequired && !(await this.verifyCaptcha(dto.captchaId, dto.captchaCode))) {
      if (!dto.captchaId) {
        throw new HttpException('密码连续错误 3 次，请输入验证码后继续', HttpStatus.PRECONDITION_REQUIRED)
      }
      throw new BadRequestException('验证码错误或已过期')
    }

    const lock = await this.redis.getCache<{ until: number }>(LOGIN_LOCK_PREFIX + rateKey)
    if (lock && lock.until > Date.now()) {
      const minutes = Math.ceil((lock.until - Date.now()) / 60000)
      throw new HttpException(`登录失败次数过多，请 ${minutes} 分钟后再试`, HttpStatus.TOO_MANY_REQUESTS)
    }

    const user = await this.findByIdentifier(dto.identifier)
    if (!user || !user.passwordHash || !(await compare(dto.password, user.passwordHash))) {
      const count = await this.redis.incrWithTtlStrict(LOGIN_FAIL_PREFIX + rateKey, LOGIN_LOCK_SEC)
      if (count >= LOGIN_MAX_FAILURES) {
        await this.redis.setCache(
          LOGIN_LOCK_PREFIX + rateKey,
          { until: Date.now() + LOGIN_LOCK_SEC * 1000 },
          LOGIN_LOCK_SEC,
        )
        await this.redis.delCache(LOGIN_FAIL_PREFIX + rateKey)
        throw new HttpException('登录失败次数过多，请 15 分钟后再试', HttpStatus.TOO_MANY_REQUESTS)
      }
      if (count >= CAPTCHA_AFTER_FAILURES) {
        throw new HttpException('密码连续错误 3 次，请输入验证码后继续', HttpStatus.PRECONDITION_REQUIRED)
      }
      throw new UnauthorizedException('账号或密码错误')
    }
    await this.redis.delCache(LOGIN_FAIL_PREFIX + rateKey)
    return this.finalizeLogin(user)
  }

  /** 验证码登录或注册（统一入口的第二屏）：手机号/邮箱验证码校验通过后，
   * 账号存在则登录、不存在则直接建号（passwordHash=null，即「未设置密码」，由用户后续在账号安全中设置）。
   * 服务端**不先查账号是否存在再决定校验**：协议勾选对所有情况统一要求（客户端无法区分登录/建号，避免账号枚举）。
   * 不参与密码失败锁定/图形验证码体系：验证码服务自身已有冷却、日限与校验失败上限。 */
  async loginByCode(dto: LoginByCodeDto): Promise<AppLoginResult & { isNewUser: boolean }> {
    if (dto.agreed !== true) {
      throw new BadRequestException('请先阅读并同意用户协议与隐私政策')
    }
    const parsed = parseIdentifier(dto.account)
    if (!parsed || parsed.kind !== dto.channel) {
      throw new BadRequestException('账号格式与所选验证方式不匹配')
    }
    const account = parsed.value

    if (dto.channel === 'email') {
      if (!(await this.emailCodes.isAvailable())) {
        throw new BadRequestException('邮箱登录暂未开放，请稍后再试或使用密码登录')
      }
      const ok = await this.emailCodes.verify(account, 'login', dto.code)
      if (!ok) throw new BadRequestException('邮箱验证码错误或已过期')
    } else {
      if (!(await this.sms.isAvailable())) {
        throw new BadRequestException('短信登录暂未开放，请稍后再试或使用密码登录')
      }
      const ok = await this.sms.verify(account, 'login', dto.code)
      if (!ok) throw new BadRequestException('短信验证码错误或已过期')
    }

    const user = await this.findByIdentifier(account)
    if (user) {
      /* 验证码校验通过即证明该渠道归本人所有：未标记可信时补写（幂等） */
      await this.ensureChannelVerified(user, dto.channel)
      return { ...(await this.finalizeLogin(user)), isNewUser: false }
    }

    /* 未注册 → 建号。维护期（许可证只读）与注册关闭时只允许登录、不允许建号。
     * 该分支位于验证码校验之后，探针必须持有该手机号/邮箱，故不构成有效账号枚举。 */
    if (!(await this.registrationOpen()) || !(await this.license.canWrite())) {
      throw new BadRequestException('注册暂未开放，请使用密码登录')
    }

    try {
      await this.createUserAccount({
        username: null,
        phone: dto.channel === 'phone' ? account : null,
        email: dto.channel === 'email' ? account : null,
        verifiedChannel: dto.channel,
        /* 「未设置密码」状态：不生成任何隐藏密码，由用户在账号安全中设置 */
        passwordHash: null,
        gender: undefined,
      })
      const fresh = await this.findByIdentifier(account)
      if (!fresh) throw new ConflictException('注册请求冲突，请重试')
      return { ...(await this.finalizeLogin(fresh)), isNewUser: true }
    } catch (error) {
      /* 并发建号唯一冲突：仅当确实能重新查到该账号时才回落为「登录」，否则视为随机撞名 */
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findByIdentifier(account)
        if (existing) return { ...(await this.finalizeLogin(existing)), isNewUser: false }
        throw new ConflictException('注册请求冲突，请重试')
      }
      throw error
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
    const attempts = await this.redis.incrWithTtl(`auth:app:reset:rate:${normalizedRateIdentifier(dto.identifier)}`, 15 * 60)
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

  /** 登录收尾（密码登录与验证码登录共用）：冻结/注销守卫 → 活跃时间 → 身份快照 → 签发 token → 每日登录积分。
   * 两条登录路径必须共用本方法，否则容易出现「冻结账号绕过守卫」或积分/活跃时间口径漂移。 */
  private async finalizeLogin(user: IdentifiedUser): Promise<AppLoginResult> {
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

  /** 建号（注册与「验证码登录顺带建号」共用）：分配用户名/昵称 → 建 User + identity → 协议同意留痕 → 欢迎站内信。
   * **不含唯一性预检**：验证码登录路径必须不查账号是否存在（避免账号枚举），唯一冲突由调用方按 P2002 兜底；
   * username 渠道由调用方预先校验并传入用户名。`passwordHash` 传 null 即「未设置密码」状态。 */
  private async createUserAccount(input: {
    username: string | null
    phone: string | null
    email: string | null
    verifiedChannel: 'phone' | 'email' | null
    passwordHash: string | null
    gender?: string
  }): Promise<{ uid: string; username: string; nickname: string }> {
    const uid = await this.ids.next('U')
    const username = input.username ?? (await this.identityNames.assignUsername())
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

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          uid,
          username,
          nickname,
          phone: input.phone,
          email: input.email,
          /* 验证码验证通过即视为可信通知渠道 */
          phoneVerifiedAt: input.verifiedChannel === 'phone' ? now : null,
          emailVerifiedAt: input.verifiedChannel === 'email' ? now : null,
          gender: normalizeGender(input.gender),
          status: 'active',
          passwordHash: input.passwordHash,
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

    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '欢迎加入聚屿社区',
      content: `注册成功，你的用户名是 ${username}，开始探索社区服务吧。`,
    })
    return { uid, username, nickname }
  }

  /** 注册开关（SystemConfig 单例行；缺行视为开放，与既有口径一致） */
  private async registrationOpen(): Promise<boolean> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { id: 1 },
      select: { registrationOpen: true },
    })
    return config?.registrationOpen !== false
  }

  /** 验证码校验通过即证明该渠道归本人所有：未标记可信时补写（幂等，已有值不动） */
  private async ensureChannelVerified(user: IdentifiedUser, channel: 'phone' | 'email'): Promise<void> {
    if (channel === 'phone' && user.phoneVerifiedAt) return
    if (channel === 'email' && user.emailVerifiedAt) return
    await this.prisma.user.update({
      where: { uid: user.uid },
      data: channel === 'phone' ? { phoneVerifiedAt: formatNow() } : { emailVerifiedAt: formatNow() },
    })
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

/** 限流/失败计数用的标识归一化：与账号定位（parseIdentifier）同口径，防变体绕过计数 */
function normalizedRateIdentifier(identifier: string | null | undefined): string {
  return parseIdentifier(identifier)?.value ?? (identifier ?? '').trim().toLowerCase()
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
