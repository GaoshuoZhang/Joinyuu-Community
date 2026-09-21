import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { PrismaService } from '../../common/prisma/prisma.service'
import { RedisService } from '../../common/redis/redis.service'
import { MessageChannelService } from './message-channel.service'
import { OutboxService } from './outbox.service'

export type EmailPurpose = 'register' | 'reset_password' | 'change_email'

export const EMAIL_PURPOSES: readonly EmailPurpose[] = ['register', 'reset_password', 'change_email']

/** 验证码有效期（秒） */
const CODE_TTL_SEC = 5 * 60
/** 同邮箱+用途 重发冷却（秒） */
const COOLDOWN_SEC = 60
/** 同邮箱+用途 校验失败上限 */
const MAX_VERIFY_ATTEMPTS = 5
/** 同邮箱每日发送上限 */
const EMAIL_DAILY_MAX = 10
/** 同 IP 发送上限 / 窗口 */
const IP_WINDOW_MAX = 20
const IP_WINDOW_SEC = 10 * 60
/** 同设备发送上限 / 窗口 */
const DEVICE_WINDOW_MAX = 10
const DEVICE_WINDOW_SEC = 60 * 60
/** 邮箱验证码模板编码（消息中心配置） */
const VERIFY_TEMPLATE_CODE = 'verify_code_email'

export interface EmailSendContext {
  ip?: string
  deviceId?: string
}

export interface EmailSendResult {
  expiresInSec: number
  /** 仅非生产环境且走干跑投递时返回，便于联调（生产恒为 undefined） */
  devCode?: string
}

/* 邮箱验证码（P0）：邮箱真实性校验，作为可信通知渠道。
 * 频控维度：邮箱（冷却 + 日限）、IP（窗口）、设备（窗口）；校验失败次数上限防枚举。
 * 下发统一走 Outbox（channelKind=email），凭据缺失时非生产环境干跑，保证开发/联调可端到端验证。 */
@Injectable()
export class EmailCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly channels: MessageChannelService,
    private readonly outbox: OutboxService,
  ) {}

  /** 邮箱通道是否可用：已启用 email 渠道 + 邮箱验证码模板已发布 */
  async isAvailable(): Promise<boolean> {
    const runtime = await this.channels.resolveFor('email')
    if (!runtime || !runtime.channel.enabled) return false
    const template = await this.prisma.messageTemplate.findFirst({
      where: { code: VERIFY_TEMPLATE_CODE, status: 'published' },
      select: { id: true },
    })
    return Boolean(template)
  }

  /** 发送验证码：频控 → 生成 6 位码入 Redis → 入队 Outbox（安全类强制送达） */
  async send(email: string, purpose: EmailPurpose, context: EmailSendContext = {}): Promise<EmailSendResult> {
    const normalized = normalizeEmail(email)
    if (!normalized) throw new BadRequestException('邮箱格式不正确')

    const runtime = await this.channels.resolveFor('email')
    if (!runtime || !runtime.channel.enabled) {
      throw new BadRequestException('邮箱通道未启用')
    }
    const template = await this.prisma.messageTemplate.findFirst({
      where: { code: VERIFY_TEMPLATE_CODE, status: 'published' },
      select: { id: true },
    })
    if (!template) throw new BadRequestException('邮箱验证码模板未配置或未发布')

    /* 冷却：同邮箱+用途 60 秒内不可重发 */
    const cooldownKey = `email:cooldown:${purpose}:${normalized}`
    const acquired = await this.redis.acquireFlag(cooldownKey, COOLDOWN_SEC)
    if (!acquired) {
      throw new HttpException('验证码发送过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    }

    const emailCount = await this.redis.incrWithTtl(`email:daily:${normalized}`, 24 * 60 * 60)
    if (emailCount !== null && emailCount > EMAIL_DAILY_MAX) {
      throw new HttpException('今日验证码发送次数已达上限', HttpStatus.TOO_MANY_REQUESTS)
    }
    const ip = context.ip?.trim()
    if (ip) {
      const ipCount = await this.redis.incrWithTtl(`email:ip:${ip}`, IP_WINDOW_SEC)
      if (ipCount !== null && ipCount > IP_WINDOW_MAX) {
        throw new HttpException('操作过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
      }
    }
    const deviceId = context.deviceId?.trim()
    if (deviceId) {
      const deviceCount = await this.redis.incrWithTtl(`email:device:${deviceId}`, DEVICE_WINDOW_SEC)
      if (deviceCount !== null && deviceCount > DEVICE_WINDOW_MAX) {
        throw new HttpException('操作过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await this.redis.setCache(codeKey(purpose, normalized), code, CODE_TTL_SEC)
    await this.redis.delCache(attemptKey(purpose, normalized))

    await this.outbox.enqueue({
      channelKind: 'email',
      templateCode: VERIFY_TEMPLATE_CODE,
      recipient: normalized,
      variables: { code, minutes: String(Math.floor(CODE_TTL_SEC / 60)) },
      idempotencyKey: `email:verify:${purpose}:${normalized}:${Date.now()}:${code}`,
    })

    return {
      expiresInSec: CODE_TTL_SEC,
      devCode: runtime.dryRun && process.env.NODE_ENV !== 'production' ? code : undefined,
    }
  }

  /** 校验并消费验证码（一次性）；失败累计次数，超过上限直接拒绝 */
  async verify(email: string, purpose: EmailPurpose, code: string): Promise<boolean> {
    const normalized = normalizeEmail(email)
    const input = (code ?? '').trim()
    if (!normalized || !/^\d{6}$/.test(input)) return false

    /* 校验失败次数为安全敏感计数：Redis 异常时拒绝而非放行，避免爆破保护失效 */
    const attempts = await this.redis.incrWithTtlStrict(attemptKey(purpose, normalized), CODE_TTL_SEC)
    if (attempts !== null && attempts > MAX_VERIFY_ATTEMPTS) return false

    /* 比对与消费在 Redis 内原子完成：并发请求不可能同时消费同一验证码 */
    if (!(await this.redis.compareAndDelete(codeKey(purpose, normalized), input))) return false

    await this.redis.delCache(attemptKey(purpose, normalized))
    return true
  }
}

function codeKey(purpose: EmailPurpose, email: string): string {
  return `email:code:${purpose}:${email}`
}

function attemptKey(purpose: EmailPurpose, email: string): string {
  return `email:attempt:${purpose}:${email}`
}

/** 邮箱归一化：去空白 + 转小写；仅接受基本格式 */
export function normalizeEmail(email: string | null | undefined): string {
  const cleaned = (email ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : ''
}
