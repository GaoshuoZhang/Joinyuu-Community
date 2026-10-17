import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type OutboxMessage } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatDateTime } from '../../common/utils/time'
import { MessageChannelService } from './message-channel.service'
import { MessageRenderService } from './message-render.service'
import { MessageProviderRegistry } from './providers/provider.registry'
import { MessageSendError } from './providers/message-provider'
import type { ChannelKind, OutboxStatus } from './messaging.types'
import type { QueryOutboxDto } from './dto/outbox.dto'

const MAX_ATTEMPTS_DEFAULT = 3
/** 退避基数（秒）：30s → 60s → 120s…，上限 30 分钟 */
const BACKOFF_BASE_SEC = 30
const BACKOFF_MAX_SEC = 1800
/** 卡在 sending 的消息回收阈值（分钟）：进程崩溃/投递挂起超过该时长后重新入队投递 */
const SENDING_STALE_MINUTES = 10

export interface EnqueueInput {
  channelKind: ChannelKind
  templateCode: string
  recipient: string
  userId?: string
  variables?: Record<string, string>
  /** 幂等键：同一业务事件重复入队只投递一次 */
  idempotencyKey: string
  priority?: number
  maxAttempts?: number
  /** 延迟发送（秒） */
  delaySeconds?: number
}

export interface EnqueueResult {
  id: string
  status: OutboxStatus
  /** 被幂等键拦截时复用既有记录 */
  deduplicated: boolean
}

/* 发送队列（P0 Outbox）：渠道路由 + 模板渲染 + 幂等 + 重试退避 + 死信 + 投递日志。
 * 用户偏好与安静时段仅约束营销类（security 类强制送达）。 */
@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly channels: MessageChannelService,
    private readonly render: MessageRenderService,
    private readonly registry: MessageProviderRegistry,
  ) {}

  /** 入队：幂等键去重（命中即复用）；营销类先经偏好/安静时段判定，安静时段内顺延 */
  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const templateCode = input.templateCode.trim()
    const recipient = input.recipient.trim()
    if (!templateCode || !recipient) throw new BadRequestException('缺少模板编码或收件人')

    const existing = await this.prisma.outboxMessage.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, status: true },
    })
    if (existing) {
      return { id: existing.id, status: existing.status as OutboxStatus, deduplicated: true }
    }

    const template = await this.prisma.messageTemplate.findUnique({
      where: { code: templateCode },
      select: { category: true },
    })
    const security = (template?.category ?? 'security') === 'security'
    const now = new Date()
    const variables = input.variables ?? {}

    let status: OutboxStatus = 'pending'
    let nextAttemptAt: string | null = formatAt(new Date(now.getTime() + (input.delaySeconds ?? 0) * 1000))
    let lastError: string | null = null

    if (!security && input.userId) {
      const gate = await this.applyMarketingGate(input.userId, input.channelKind, now)
      if (gate === 'skipped') {
        status = 'skipped'
        lastError = '用户已退订该渠道营销消息'
        nextAttemptAt = null
      } else if (gate instanceof Date) {
        nextAttemptAt = formatAt(gate)
        lastError = '处于用户安静时段，已顺延'
      }
    }

    const id = await this.ids.next('OB')
    try {
      await this.prisma.outboxMessage.create({
        data: {
          id,
          idempotencyKey: input.idempotencyKey,
          channelKind: input.channelKind,
          templateCode,
          recipient,
          userId: input.userId ?? null,
          payload: variables as Prisma.InputJsonValue,
          status,
          priority: input.priority ?? 0,
          attempts: 0,
          maxAttempts: input.maxAttempts ?? MAX_ATTEMPTS_DEFAULT,
          nextAttemptAt,
          lastError,
          security,
          createdAt: formatAt(now),
          updatedAt: formatAt(now),
        },
      })
    } catch (error) {
      /* 并发下同一幂等键：回读既有记录，保持"只投递一次" */
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const row = await this.prisma.outboxMessage.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true, status: true },
        })
        if (row) return { id: row.id, status: row.status as OutboxStatus, deduplicated: true }
      }
      throw error
    }
    return { id, status, deduplicated: false }
  }

  /** 处理到期待发送消息；返回本次处理条数（供调度器日志）
   * BE-M2 修复：抢占为 sending 后若进程崩溃/投递挂起，记录会永久停留 sending。
   * 扫描时额外回收超过阈值未完成的 sending（updatedAt ≤ now - 10min）重新入队投递。 */
  async processPending(limit = 20): Promise<number> {
    const now = formatAt(new Date())
    const staleBefore = formatAt(new Date(Date.now() - SENDING_STALE_MINUTES * 60_000))
    const candidates = await this.prisma.outboxMessage.findMany({
      where: {
        OR: [
          {
            status: { in: ['pending', 'failed'] },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          /* 卡死的 sending 超时回收（updatedAt 为 VARCHAR(16) 分钟精度，阈值 10 分钟足够避开在途消息） */
          { status: 'sending', updatedAt: { lte: staleBefore } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    })

    let processed = 0
    for (const candidate of candidates) {
      /* 乐观抢占：pending/failed 按状态抢占；超时 sending 必须同时满足「已超时」才可回收，
       * 否则两个实例会先后把同一条 sending 抢到并各投递一次（重复短信/邮件）。 */
      const claimWhere: Prisma.OutboxMessageWhereInput =
        candidate.status === 'sending'
          ? { id: candidate.id, status: 'sending', updatedAt: { lte: staleBefore } }
          : { id: candidate.id, status: { in: ['pending', 'failed'] } }
      const claimed = await this.prisma.outboxMessage.updateMany({
        where: claimWhere,
        data: { status: 'sending', updatedAt: formatAt(new Date()) },
      })
      if (claimed.count !== 1) continue
      processed += 1
      /* deliver 内部异常兜底回写 failed（含重试退避），避免再次长期滞留 sending */
      await this.deliver(candidate.id).catch(async (e) => {
        console.error('[messaging] 投递异常，回写 failed:', e instanceof Error ? e.message : e)
        await this.prisma.outboxMessage.updateMany({
          where: { id: candidate.id, status: 'sending' },
          data: {
            status: 'failed',
            lastError: (e instanceof Error ? e.message : String(e)).slice(0, 512),
            nextAttemptAt: formatAt(new Date(Date.now() + backoffSeconds(candidate.attempts + 1) * 1000)),
            updatedAt: formatAt(new Date()),
          },
        })
      })
    }
    return processed
  }

  async list(query: QueryOutboxDto): Promise<{ list: Record<string, unknown>[]; total: number; stats: Record<string, number> }> {
    const where: Prisma.OutboxMessageWhereInput = {}
    if (query.status) where.status = query.status
    if (query.channelKind) where.channelKind = query.channelKind
    const keyword = query.keyword?.trim()
    if (keyword) {
      /* 说明：不检索 idempotencyKey——安全类消息的幂等键内嵌验证码，可作为侧信道枚举 */
      where.OR = [
        { recipient: { contains: keyword } },
        { templateCode: { contains: keyword } },
        { userId: { contains: keyword } },
      ]
    }

    const [rows, total, grouped] = await Promise.all([
      this.prisma.outboxMessage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.outboxMessage.count({ where }),
      this.prisma.outboxMessage.groupBy({ by: ['status'], _count: { _all: true } }),
    ])

    const stats: Record<string, number> = { pending: 0, sending: 0, sent: 0, failed: 0, dead: 0, skipped: 0 }
    for (const item of grouped) stats[item.status] = item._count._all

    return { list: rows.map(toOutboxDto), total, stats }
  }

  /** 投递日志（按时间倒序，最新在前） */
  async logs(outboxId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.prisma.messageDeliveryLog.findMany({
      where: { outboxId },
      orderBy: [{ at: 'desc' }],
    })
    return rows.map((row) => ({
      id: row.id,
      attempt: row.attempt,
      status: row.status,
      provider: row.provider,
      providerMessageId: row.providerMessageId,
      error: row.error,
      costMs: row.costMs,
      at: row.at,
    }))
  }

  /** 手动重试（failed/dead/skipped → pending）；已投递/处理中的消息不可重试，避免重复发送 */
  async retry(id: string, operator: string): Promise<{ code: number }> {
    const row = await this.require(id)
    if (row.status !== 'failed' && row.status !== 'dead' && row.status !== 'skipped') {
      throw new BadRequestException('仅失败/已终止/已跳过的消息可以重试')
    }
    await this.prisma.outboxMessage.update({
      where: { id },
      data: { status: 'pending', nextAttemptAt: formatAt(new Date()), lastError: null, updatedAt: formatAt(new Date()) },
    })
    await this.audit.record({
      module: '消息中心',
      action: '重试消息投递',
      target: `${row.templateCode} → ${row.recipient}`,
      operator,
    })
    return { code: 0 }
  }

  /** 手动终止（进入死信，不再自动重试） */
  async discard(id: string, operator: string): Promise<{ code: number }> {
    const row = await this.require(id)
    await this.prisma.outboxMessage.update({
      where: { id },
      data: { status: 'dead', lastError: '手动终止', nextAttemptAt: null, updatedAt: formatAt(new Date()) },
    })
    await this.audit.record({
      module: '消息中心',
      action: '终止消息投递',
      target: `${row.templateCode} → ${row.recipient}`,
      operator,
    })
    return { code: 0 }
  }

  /* ---------- 内部 ---------- */

  private async require(id: string): Promise<OutboxMessage> {
    const row = await this.prisma.outboxMessage.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('消息记录不存在')
    return row
  }

  /** 营销类准入：false 退订 → 'skipped'；命中安静时段 → 顺延到结束时刻 */
  private async applyMarketingGate(
    userId: string,
    kind: ChannelKind,
    now: Date,
  ): Promise<'skipped' | Date | 'ok'> {
    const consent = await this.prisma.contactConsent.findUnique({
      where: { userId_channelKind_purpose: { userId, channelKind: kind, purpose: 'marketing' } },
    })
    if (consent && !consent.consented) return 'skipped'

    const preference = await this.prisma.userNotificationPreference.findUnique({
      where: { userId },
      select: { quietHoursStart: true, quietHoursEnd: true, channelPrefs: true },
    })
    if (!preference) return 'ok'

    const prefs = (preference.channelPrefs ?? {}) as Record<string, unknown>
    if (prefs[kind] === false) return 'skipped'

    const end = quietHoursEnd(now, preference.quietHoursStart, preference.quietHoursEnd)
    return end ?? 'ok'
  }

  /** 单条投递：解析渠道与模板 → 渲染 → 发送 → 落投递日志；失败按退避重试或进死信 */
  private async deliver(id: string): Promise<void> {
    const row = await this.prisma.outboxMessage.findUnique({ where: { id } })
    if (!row) return

    const kind = row.channelKind as ChannelKind
    const variables = (row.payload ?? {}) as Record<string, string>
    const attempt = row.attempts + 1

    const fail = async (error: string, retriable: boolean, provider: string): Promise<void> => {
      const dead = !retriable || attempt >= row.maxAttempts
      const nextAttemptAt = dead ? null : formatAt(new Date(Date.now() + backoffSeconds(attempt) * 1000))
      await this.prisma.outboxMessage.update({
        where: { id },
        data: {
          status: dead ? 'dead' : 'failed',
          attempts: attempt,
          lastError: error.slice(0, 512),
          nextAttemptAt,
          updatedAt: formatAt(new Date()),
        },
      })
      await this.writeLog(id, kind, provider, row.recipient, attempt, 'failed', null, error, 0)
    }

    const runtime = await this.channels.resolveFor(kind)
    if (!runtime) return fail('没有已启用的消息渠道', false, '-')

    const template = await this.prisma.messageTemplate.findUnique({
      where: { code: row.templateCode },
      include: { versions: { where: { status: 'published' }, orderBy: { version: 'desc' }, take: 1 } },
    })
    const version = template?.versions[0]
    if (!template || !version) return fail('模板不存在或未发布', false, runtime.provider)

    const allowed = Array.isArray(template.variables) ? template.variables.map((v) => String(v)) : []
    let subject: string | undefined
    let body: string
    try {
      this.render.assertRenderable(allowed, version.subject ?? undefined, version.body, variables)
      subject = this.render.render(version.subject ?? undefined, variables) || undefined
      body = this.render.render(version.body, variables)
    } catch (error) {
      return fail(error instanceof Error ? error.message : '模板渲染失败', false, runtime.provider)
    }

    const provider = runtime.dryRun ? this.registry.dryRun() : this.registry.resolve(runtime.provider)
    /* 短信通道按位置传参（腾讯 {1}/{2}、阿里模板参数），参数个数必须与供应商已审批模板一致：
     * 只传模板正文实际引用的变量（顺序即正文出现顺序）；其余渠道仍用全量变量（站内信按变量取标题/链接）。 */
    const providerVariables =
      kind === 'sms' ? this.render.pickUsed(version.subject ?? undefined, version.body, variables) : variables
    const startedAt = Date.now()
    try {
      const result = await provider.send({
        recipient: row.recipient,
        subject,
        body,
        templateCode: row.templateCode,
        variables: providerVariables,
        config: runtime.config,
        credentials: runtime.credentials,
      })
      const costMs = Date.now() - startedAt
      await this.prisma.outboxMessage.update({
        where: { id },
        data: {
          status: 'sent',
          attempts: attempt,
          providerMessageId: result.providerMessageId ?? null,
          sentAt: formatAt(new Date()),
          lastError: null,
          nextAttemptAt: null,
          updatedAt: formatAt(new Date()),
        },
      })
      await this.writeLog(id, kind, runtime.provider, row.recipient, attempt, 'sent', result.providerMessageId ?? null, null, costMs)
    } catch (error) {
      const costMs = Date.now() - startedAt
      const message = error instanceof Error ? error.message : String(error)
      const retriable = error instanceof MessageSendError ? error.retriable : true
      const dead = !retriable || attempt >= row.maxAttempts
      const nextAttemptAt = dead ? null : formatAt(new Date(Date.now() + backoffSeconds(attempt) * 1000))
      await this.prisma.outboxMessage.update({
        where: { id },
        data: {
          status: dead ? 'dead' : 'failed',
          attempts: attempt,
          lastError: message.slice(0, 512),
          nextAttemptAt,
          updatedAt: formatAt(new Date()),
        },
      })
      await this.writeLog(id, kind, runtime.provider, row.recipient, attempt, 'failed', null, message, costMs)
    }
  }

  private async writeLog(
    outboxId: string,
    channelKind: ChannelKind,
    provider: string,
    recipient: string,
    attempt: number,
    status: 'sent' | 'failed' | 'skipped',
    providerMessageId: string | null,
    error: string | null,
    costMs: number,
  ): Promise<void> {
    try {
      await this.prisma.messageDeliveryLog.create({
        data: {
          id: await this.ids.next('ML'),
          outboxId,
          channelKind,
          provider,
          recipient,
          attempt,
          status,
          providerMessageId,
          error: error ? error.slice(0, 512) : null,
          costMs,
          at: formatAt(new Date()),
        },
      })
    } catch (e) {
      console.error('[messaging] 投递日志写入失败（忽略）:', e instanceof Error ? e.message : e)
    }
  }
}

function toOutboxDto(row: OutboxMessage): Record<string, unknown> {
  return {
    id: row.id,
    templateCode: row.templateCode,
    channelKind: row.channelKind,
    recipient: row.recipient,
    userId: row.userId,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    security: row.security,
    lastError: row.lastError,
    providerMessageId: row.providerMessageId,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    /* 安全类消息（验证码等）变量脱敏：运营可见投递状态，但不得读到在途验证码 */
    variables: row.security ? maskSecurityVariables(row.payload) : row.payload,
  }
}

/** 安全类消息变量脱敏：疑似凭据键（code/token/password/link 等）统一掩码 */
function maskSecurityVariables(payload: Prisma.JsonValue): Prisma.JsonValue {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  const masked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    masked[key] = /code|token|password|secret|link/i.test(key) ? '******' : value
  }
  return masked as Prisma.JsonValue
}

/** 指数退避：30s, 60s, 120s… 上限 30 分钟 */
function backoffSeconds(attempt: number): number {
  return Math.min(BACKOFF_BASE_SEC * 2 ** Math.max(0, attempt - 1), BACKOFF_MAX_SEC)
}

/** 命中安静时段返回结束时刻（跨天时顺延到次日），否则 null */
function quietHoursEnd(now: Date, start?: string | null, end?: string | null): Date | null {
  if (!start || !end) return null
  const startMin = toMinutes(start)
  const endMin = toMinutes(end)
  if (startMin == null || endMin == null || startMin === endMin) return null

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const overnight = startMin > endMin
  const inQuiet = overnight ? nowMin >= startMin || nowMin < endMin : nowMin >= startMin && nowMin < endMin
  if (!inQuiet) return null

  const result = new Date(now)
  result.setSeconds(0, 0)
  const crossesDay = overnight && nowMin >= startMin
  const target = crossesDay ? endMin + 24 * 60 : endMin
  result.setMinutes(result.getMinutes() + (target - nowMin))
  return result
}

function toMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** 时间格式化：OutboxMessage 各时间列为 VARCHAR(16)，须用 YYYY-MM-DD HH:mm（不含秒） */
function formatAt(date: Date): string {
  return formatDateTime(date)
}
