import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { PrismaService } from '../../common/prisma/prisma.service'
import { RedisService } from '../../common/redis/redis.service'
import { MessageChannelService } from './message-channel.service'
import { OutboxService } from './outbox.service'

export type SmsPurpose = 'register' | 'reset_password' | 'change_phone' | 'login'

export const SMS_PURPOSES: readonly SmsPurpose[] = ['register', 'reset_password', 'change_phone', 'login']

/** 验证码有效期（秒） */
const CODE_TTL_SEC = 5 * 60
/** 同号码+用途 重发冷却（秒） */
const COOLDOWN_SEC = 60
/** 同号码+用途 校验失败上限 */
const MAX_VERIFY_ATTEMPTS = 5
/** 同号码每日发送上限 */
const PHONE_DAILY_MAX = 10
/** 同 IP 发送上限 / 窗口 */
const IP_WINDOW_MAX = 20
const IP_WINDOW_SEC = 10 * 60
/** 同设备发送上限 / 窗口 */
const DEVICE_WINDOW_MAX = 10
const DEVICE_WINDOW_SEC = 60 * 60
/** 使用模板中心的验证码模板编码 */
const VERIFY_TEMPLATE_CODE = 'verify_code'

export interface SmsSendContext {
  ip?: string
  deviceId?: string
}

export interface SmsSendResult {
  expiresInSec: number
  /** 仅非生产环境且走干跑投递时返回，便于联调（生产恒为 undefined） */
  devCode?: string
}

/* 短信验证码（P0）：手机号真实性校验。
 * 频控维度：手机号（冷却 + 日限）、IP（窗口）、设备（窗口）；校验失败次数上限防枚举。
 * 下发统一走 Outbox，凭据缺失时非生产环境干跑，保证开发/联调可端到端验证。 */
@Injectable()
export class SmsCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly channels: MessageChannelService,
    private readonly outbox: OutboxService,
  ) {}

  /** 短信通道是否可用：已启用 sms 渠道 + 验证码模板已发布 */
  async isAvailable(): Promise<boolean> {
    const runtime = await this.channels.resolveFor('sms')
    if (!runtime || !runtime.channel.enabled) return false
    const template = await this.prisma.messageTemplate.findFirst({
      where: { code: VERIFY_TEMPLATE_CODE, status: 'published' },
      select: { id: true },
    })
    return Boolean(template)
  }

  /** 发送验证码：频控 → 生成 6 位码入 Redis → 入队 Outbox（安全类强制送达） */
  async send(phone: string, purpose: SmsPurpose, context: SmsSendContext = {}): Promise<SmsSendResult> {
    const normalized = normalizePhone(phone)
    if (!normalized) throw new BadRequestException('手机号格式不正确')

    const runtime = await this.channels.resolveFor('sms')
    if (!runtime || !runtime.channel.enabled) {
      throw new BadRequestException('短信通道未启用')
    }
    const template = await this.prisma.messageTemplate.findFirst({
      where: { code: VERIFY_TEMPLATE_CODE, status: 'published' },
      select: { id: true },
    })
    if (!template) throw new BadRequestException('短信验证码模板未配置或未发布')

    /* 冷却：同号码+用途 60 秒内不可重发 */
    const cooldownKey = `sms:cooldown:${purpose}:${normalized}`
    const acquired = await this.redis.acquireFlag(cooldownKey, COOLDOWN_SEC)
    if (!acquired) {
      throw new HttpException('验证码发送过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    }

    const phoneCount = await this.redis.incrWithTtl(`sms:daily:${normalized}`, 24 * 60 * 60)
    if (phoneCount !== null && phoneCount > PHONE_DAILY_MAX) {
      throw new HttpException('今日验证码发送次数已达上限', HttpStatus.TOO_MANY_REQUESTS)
    }
    const ip = context.ip?.trim()
    if (ip) {
      const ipCount = await this.redis.incrWithTtl(`sms:ip:${ip}`, IP_WINDOW_SEC)
      if (ipCount !== null && ipCount > IP_WINDOW_MAX) {
        throw new HttpException('操作过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
      }
    }
    const deviceId = context.deviceId?.trim()
    if (deviceId) {
      const deviceCount = await this.redis.incrWithTtl(`sms:device:${deviceId}`, DEVICE_WINDOW_SEC)
      if (deviceCount !== null && deviceCount > DEVICE_WINDOW_MAX) {
        throw new HttpException('操作过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await this.redis.setCache(codeKey(purpose, normalized), code, CODE_TTL_SEC)
    await this.redis.delCache(attemptKey(purpose, normalized))

    await this.outbox.enqueue({
      channelKind: 'sms',
      templateCode: VERIFY_TEMPLATE_CODE,
      recipient: normalized,
      variables: { code, minutes: String(Math.floor(CODE_TTL_SEC / 60)) },
      idempotencyKey: `sms:verify:${purpose}:${normalized}:${Date.now()}:${code}`,
    })

    return {
      expiresInSec: CODE_TTL_SEC,
      devCode: runtime.dryRun && process.env.NODE_ENV !== 'production' ? code : undefined,
    }
  }

  /** 校验并消费验证码（一次性）；失败累计次数，超过上限直接拒绝 */
  async verify(phone: string, purpose: SmsPurpose, code: string): Promise<boolean> {
    const normalized = normalizePhone(phone)
    const input = (code ?? '').trim()
    if (!normalized || !/^\d{6}$/.test(input)) return false

    const attempts = await this.redis.incrWithTtl(attemptKey(purpose, normalized), CODE_TTL_SEC)
    if (attempts !== null && attempts > MAX_VERIFY_ATTEMPTS) return false

    const expected = await this.redis.getCache<string>(codeKey(purpose, normalized))
    if (!expected) return false

    if (expected !== input) return false

    await this.redis.delCache(codeKey(purpose, normalized), attemptKey(purpose, normalized))
    return true
  }
}

function codeKey(purpose: SmsPurpose, phone: string): string {
  return `sms:code:${purpose}:${phone}`
}

function attemptKey(purpose: SmsPurpose, phone: string): string {
  return `sms:attempt:${purpose}:${phone}`
}

/** 中国大陆手机号归一化：去空格/分隔符，去掉 +86 前缀 */
function normalizePhone(phone: string): string {
  const cleaned = (phone ?? '').replace(/[\s-]/g, '').replace(/^\+?86/, '')
  return /^1\d{10}$/.test(cleaned) ? cleaned : ''
}
