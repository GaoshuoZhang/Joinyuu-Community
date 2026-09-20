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
import { NotificationService } from '../../../common/notify/notification.service'
import { AppSessionService } from '../../../common/app-session/app-session.service'
import { formatNow } from '../../../common/utils/time'
import { normalizeGender } from '../../../common/utils/gender'
import { BUILTIN_AGREEMENTS, BUILTIN_AGREEMENT_VERSION } from '../policies/builtin-agreements'
import { buildCaptcha } from '../../auth/captcha.util'
import type { AppJwtPayload } from '../../../common/interfaces/app-jwt-payload'
import type { RegisterDto } from './dto/register.dto'
import type { AppLoginDto } from './dto/login.dto'
import type { ResetPasswordDto } from './dto/reset-password.dto'
import type { ChangePhoneDto } from '../me/dto/change-phone.dto'

/** JWT 有效期（秒），与共享 JwtModule 的 expiresIn 2h 对齐 */
const TOKEN_TTL_SEC = 2 * 60 * 60
/** 图形验证码存储前缀（独立于 admin 的 captcha:，避免跨体系串号） */
const CAPTCHA_PREFIX = 'captcha:app:'
const CAPTCHA_TTL = 5 * 60
/** 验证码限流：同一 IP 60 秒内最多 30 次（防接口滥用） */
const CAPTCHA_RATE_MAX = 30
const CAPTCHA_RATE_WINDOW_SEC = 60
/** 身份类型 → 展示标签（登录快照与登录态摘要用，title 缺省时兜底） */
const IDENTITY_LABEL: Record<string, string> = {
  individual: '个人用户',
  community_individual: '社区个体',
  community_enterprise: '社区企业',
  external_enterprise: '合作企业',
}

/** 登录/注册成功响应的数据形状（token + 用户快照 + 身份摘要 + 积分余额） */
export interface AppLoginResult {
  token: string
  uid: string
  name: string
  identities: AppIdentitySnapshot[]
  points: number
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

  /** 校验并一次性消费验证码（错误也消费，防自动化枚举） */
  private async verifyCaptcha(captchaId: string, code: string): Promise<boolean> {
    const expected = await this.redis.getCache<string>(CAPTCHA_PREFIX + captchaId)
    await this.redis.delCache(CAPTCHA_PREFIX + captchaId)
    if (!expected) return false
    return expected.toUpperCase() === (code ?? '').toUpperCase()
  }

  /** 注册：开关校验 → 手机号唯一 → 建用户 + 默认 individual 身份 + 协议同意留痕 → 签发 app JWT */
  async register(dto: RegisterDto): Promise<AppLoginResult> {
    const captchaOk = await this.verifyCaptcha(dto.captchaId, dto.captchaCode)
    if (!captchaOk) throw new BadRequestException('验证码错误或已过期')
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (config && config.registrationOpen === false) {
      throw new BadRequestException('注册暂未开放')
    }
    if (dto.agreed !== true) {
      throw new BadRequestException('请先阅读并同意用户协议与隐私政策')
    }
    const phone = dto.phone.trim()
    if (!/^1\d{10}$/.test(phone)) {
      throw new BadRequestException('手机号格式不正确')
    }
    const existing = await this.prisma.user.findFirst({ where: { phone }, select: { uid: true } })
    if (existing) throw new ConflictException('该手机号已注册')

    const uid = await this.ids.next('U')
    const nickname = dto.nickname.trim()
    if (!nickname) throw new BadRequestException('请输入昵称')
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
          nickname,
          phone,
          email: dto.email?.trim() ?? '',
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
        throw new ConflictException('该手机号已注册')
      }
      throw error
    }

    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '欢迎加入聚屿社区',
      content: '注册成功，开始探索社区服务吧。',
    })

    const token = await this.signToken(uid, nickname, [{ type: 'individual', label: '个人用户' }])
    return { token, uid, name: nickname, identities: [{ type: 'individual', label: '个人用户' }], points: 0 }
  }

  /** 登录：校验验证码 → 校验手机号/密码与状态 → 签发多身份 app JWT → 触发每日登录积分（自然日去重） */
  async login(dto: AppLoginDto): Promise<AppLoginResult> {
    const captchaOk = await this.verifyCaptcha(dto.captchaId, dto.captchaCode)
    if (!captchaOk) throw new BadRequestException('验证码错误或已过期')

    const user = await this.prisma.user.findFirst({
      where: { phone: dto.phone.trim() },
      include: { identities: true },
    })
    if (!user || !user.passwordHash || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('手机号或密码错误')
    }
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
    return { token, uid: user.uid, name: user.nickname, identities, points: fresh?.points ?? 0 }
  }

  /** 登出：jti 加入黑名单（剩余有效期），token 即时失效 */
  async logout(payload: AppJwtPayload): Promise<{ code: number }> {
    const exp = payload.exp ?? Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
    const remaining = exp - Math.floor(Date.now() / 1000)
    await this.redis.blacklist(payload.jti, remaining)
    await this.sessions.remove(payload.sub, payload.jti)
    return { code: 0 }
  }

  /** 找回密码（短信降级为图形验证码）：校验验证码 → 更新密码 → 站内信通知 */
  async resetPassword(dto: ResetPasswordDto): Promise<{ code: number }> {
    const attempts = await this.redis.incrWithTtl(`auth:app:reset:rate:${dto.phone.trim()}`, 15 * 60)
    if (attempts !== null && attempts > 5) {
      throw new HttpException('操作过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    }
    const captchaOk = await this.verifyCaptcha(dto.captchaId, dto.captchaCode)
    if (!captchaOk) throw new BadRequestException('验证码错误或已过期')

    const user = await this.prisma.user.findFirst({ where: { phone: dto.phone.trim() } })
    /* D-105：未注册手机号是业务校验失败而非登录失效，用 400 避免触发客户端全局 401 登出跳转 */
    if (!user) throw new BadRequestException('该手机号未注册')

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

  async changePhone(uid: string, dto: ChangePhoneDto): Promise<{ code: number }> {
    const captchaOk = await this.verifyCaptcha(dto.captchaId, dto.captchaCode)
    if (!captchaOk) throw new BadRequestException('验证码错误或已过期')
    const newPhone = dto.newPhone.trim()
    const conflict = await this.prisma.user.findUnique({ where: { phone: newPhone }, select: { uid: true } })
    if (conflict && conflict.uid !== uid) throw new ConflictException('该手机号已绑定其他账号')
    await this.prisma.user.update({ where: { uid }, data: { phone: newPhone } })
    await this.notify.pushNotice(uid, {
      type: 'system',
      title: '手机号已更换',
      content: '您绑定的手机号已更换成功，请牢记新号码登录。',
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
