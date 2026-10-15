import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type MessageChannel } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow } from '../../common/utils/time'
import { MessageProviderRegistry } from './providers/provider.registry'
import { MessageRenderService } from './message-render.service'
import { providerMeta, type ChannelKind, type ChannelView } from './messaging.types'
import {
  mergeCredentialInput,
  normalizeCredentialMode,
  resolveCredential,
  validateCredentialInput,
  type CredentialField,
  type CredentialMode,
} from '../../common/credentials/credential-store'
import type { MessageChannelPayloadDto, TestSendDto } from './dto/message-channel.dto'

export interface ChannelRuntime {
  channel: MessageChannel
  provider: string
  config: Record<string, unknown>
  credentialMode: CredentialMode
  credentials: Record<string, string>
  credentialConfigured: boolean
  missingCredentials: string[]
  /** 凭据缺失时的降级干跑（仅非生产环境） */
  dryRun: boolean
}

/** 驱动的凭据字段（消息渠道目录以变量名为键，标签同名） */
function credentialFieldsFor(provider: string): CredentialField[] {
  return (providerMeta(provider)?.credentialKeys ?? []).map((key) => ({ key, label: key }))
}

/* 消息渠道配置：非机密配置入库，凭据支持两种来源——
 * inline=后台直接填写（只写/脱敏/不入审计），env=登记环境变量名。
 * 任何对外输出都不含凭据原文，只给脱敏值与「是否齐备」。 */
@Injectable()
export class MessageChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly registry: MessageProviderRegistry,
    private readonly render: MessageRenderService,
  ) {}

  async list(): Promise<ChannelView[]> {
    const rows = await this.prisma.messageChannel.findMany({
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    })
    return rows.map((row) => this.toView(row))
  }

  /** 供 Outbox / 短信验证码按消息类型取「已启用渠道」运行时（无启用渠道返回 null） */
  async resolveFor(kind: ChannelKind): Promise<ChannelRuntime | null> {
    const row = await this.prisma.messageChannel.findFirst({
      where: { kind, enabled: true },
      orderBy: { createdAt: 'asc' },
    })
    return row ? this.toRuntime(row) : null
  }

  async resolveById(id: string): Promise<ChannelRuntime> {
    return this.toRuntime(await this.require(id))
  }

  async upsert(dto: MessageChannelPayloadDto, operator: string, editingId?: string): Promise<{ id: string }> {
    return this.persist(dto, operator, editingId)
  }

  async saveFixed(kind: string, dto: MessageChannelPayloadDto, operator: string): Promise<{ id: string }> {
    if (!['sms', 'email', 'inapp'].includes(kind) || dto.kind !== kind) {
      throw new BadRequestException('通知类型不合法或与配置不一致')
    }
    if (!(kind === 'sms' ? ['aliyun_sms', 'tencent_sms'] : kind === 'email' ? ['smtp'] : ['inapp']).includes(dto.provider)) {
      throw new BadRequestException('请选择该通知类型支持的供应商')
    }
    return this.prisma.$transaction(async (tx) => {
      // 同一类型串行保存；供应商切换、首次配置和历史配置停用必须一起成功或回滚。
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`notification-channel:${kind}`}))`
      const rows = await tx.messageChannel.findMany({ where: { kind }, orderBy: { createdAt: 'asc' } })
      const target = rows.find(row => row.provider === dto.provider) ?? rows.find(row => row.enabled) ?? rows[0]
      const result = await this.persist(dto, operator, target?.id, tx, true)
      await tx.messageChannel.updateMany({ where: { kind, id: { not: result.id } }, data: { enabled: false } })
      return result
    })
  }

  private async persist(dto: MessageChannelPayloadDto, operator: string, editingId?: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma, fixed = false): Promise<{ id: string }> {
    const meta = providerMeta(dto.provider)
    if (!meta) throw new BadRequestException(`未知消息驱动：${dto.provider}`)
    if (!meta.supports.includes(dto.kind as ChannelKind)) {
      throw new BadRequestException(`${meta.label} 不支持消息类型 ${dto.kind}`)
    }
    const config = validateConfig(dto.config, meta.configFields)
    /* 凭据来源：inline=后台直接填写（只写，留空保持原值）；env=登记环境变量名 */
    const credentialMode = normalizeCredentialMode(dto.credentialMode, 'env')
    const credentialFields = credentialFieldsFor(dto.provider)
    let credentialInput: Record<string, string>
    try {
      credentialInput = validateCredentialInput(credentialMode, dto.credentialEnv, credentialFields)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '凭据校验失败')
    }

    const name = dto.name.trim()
    if (!name) throw new BadRequestException('渠道名称不能为空')

    let existing = await db.messageChannel.findUnique({
      where: { kind_provider: { kind: dto.kind, provider: dto.provider } },
    })
    if (!editingId && existing) throw new ConflictException('该消息驱动已配置，请在已有渠道中编辑')
    if (!editingId && !fixed && await db.messageChannel.findFirst({ where: { kind: dto.kind } })) {
      throw new ConflictException('该通知类型已有固定配置，请编辑已有配置')
    }
    if (editingId) {
      const original = await db.messageChannel.findUnique({ where: { id: editingId } })
      if (!original) throw new NotFoundException('通知配置不存在')
      if (original.kind !== dto.kind || (!fixed && original.provider !== dto.provider)) {
        throw new BadRequestException('编辑渠道不能变更消息类型或驱动')
      }
      if (existing && existing.id !== editingId) throw new ConflictException('渠道已变更，请刷新后重试')
      existing = original
    }
    /* 仅当来源模式未变时才沿用旧值（避免把环境变量名当密钥、或反之） */
    const previousSameMode =
      existing && existing.provider === dto.provider && normalizeCredentialMode(existing.credentialMode, 'env') === credentialMode
        ? asStringRecord(existing.credentialEnv)
        : {}
    const credentialEnv = mergeCredentialInput(credentialMode, credentialInput, previousSameMode)
    const now = formatNow()
    const data = {
      kind: dto.kind,
      provider: dto.provider,
      name,
      enabled: dto.enabled,
      config: config as Prisma.InputJsonValue,
      credentialMode,
      credentialEnv: credentialEnv as Prisma.InputJsonValue,
      dailyLimit: dto.dailyLimit,
      remark: dto.remark?.trim() || null,
      updatedAt: now,
    }

    if (existing) {
      await db.messageChannel.update({ where: { id: existing.id }, data })
      await this.audit.record({
        module: '消息中心',
        action: '保存消息渠道',
        target: `${name}（${dto.provider}）`,
        detail: `类型 ${dto.kind} · ${dto.enabled ? '已启用' : '已停用'} · 每日上限 ${dto.dailyLimit || '不限'}`,
        operator: operator || '社区管理员',
      })
      return { id: existing.id }
    }

    const id = await this.ids.next('MC', db)
    await db.messageChannel.create({
      data: { ...data, id, createdAt: now, updatedBy: '社区管理员' },
    })
    await this.audit.record({
      module: '消息中心',
      action: '新增消息渠道',
      target: `${name}（${dto.provider}）`,
      detail: `类型 ${dto.kind} · ${dto.enabled ? '已启用' : '已停用'}`,
      operator: operator || '社区管理员',
    })
    return { id }
  }

  async setEnabled(id: string, enabled: boolean, operator: string): Promise<{ code: number }> {
    const channel = await this.require(id)
    await this.prisma.messageChannel.update({
      where: { id },
      data: { enabled, updatedAt: formatNow() },
    })
    await this.audit.record({
      module: '消息中心',
      action: enabled ? '启用消息渠道' : '停用消息渠道',
      target: `${channel.name}（${channel.provider}）`,
      operator: operator || '社区管理员',
    })
    return { code: 0 }
  }

  /** 测试发送：不写 Outbox；凭据缺失时在非生产环境降级为干跑，便于连通性验证 */
  async testSend(
    id: string,
    dto: TestSendDto,
    operator: string,
  ): Promise<{ providerMessageId?: string; dryRun: boolean; costMs: number; warnings: string[] }> {
    const runtime = await this.resolveById(id)
    const recipient = dto.recipient.trim()
    if (!recipient) throw new BadRequestException('请输入测试收件人')

    const built = await this.buildTestMessage(runtime, dto)
    const provider = runtime.dryRun ? this.registry.dryRun() : this.registry.resolve(runtime.provider)
    const startedAt = Date.now()
    try {
      const result = await provider.send({
        recipient,
        subject: built.subject,
        body: built.body,
        templateCode: built.templateCode,
        variables: built.variables,
        config: runtime.config,
        credentials: runtime.credentials,
      })
      const costMs = Date.now() - startedAt
      await this.audit.record({
        module: '消息中心',
        action: '测试发送消息',
        target: `${runtime.channel.name}（${runtime.provider}）`,
        detail: `收件人 ${maskRecipient(recipient)} · 模板 ${built.templateCode} · ${runtime.dryRun ? '干跑' : '真实发送'} · ${costMs}ms`,
        operator: operator || '社区管理员',
      })
      return {
        providerMessageId: result.providerMessageId,
        dryRun: runtime.dryRun,
        costMs,
        warnings: result.warnings ?? [],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.audit.record({
        module: '消息中心',
        action: '测试发送消息失败',
        target: `${runtime.channel.name}（${runtime.provider}）`,
        detail: message.slice(0, 255),
        operator: operator || '社区管理员',
      })
      throw new BadRequestException(`测试发送失败：${message}`)
    }
  }

  /* ---------- 内部工具 ---------- */

  private async require(id: string): Promise<MessageChannel> {
    const channel = await this.prisma.messageChannel.findUnique({ where: { id } })
    if (!channel) throw new NotFoundException('消息渠道不存在')
    return channel
  }

  private toView(row: MessageChannel): ChannelView {
    const meta = providerMeta(row.provider)
    const mode = normalizeCredentialMode(row.credentialMode, 'env')
    const resolution = resolveCredential(mode, asStringRecord(row.credentialEnv), credentialFieldsFor(row.provider))
    return {
      id: row.id,
      kind: row.kind as ChannelKind,
      provider: row.provider,
      providerLabel: meta?.label ?? row.provider,
      name: row.name,
      enabled: row.enabled,
      config: asObject(row.config),
      credentialMode: mode,
      /* inline 模式恒为空（不回传密钥）；env 模式回变量名 */
      credentialEnv: resolution.envNames,
      credentialMasked: resolution.masked,
      credentialConfigured: resolution.configured,
      missingCredentials: resolution.missing,
      dailyLimit: row.dailyLimit,
      remark: row.remark,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    }
  }

  private toRuntime(row: MessageChannel): ChannelRuntime {
    const mode = normalizeCredentialMode(row.credentialMode, 'env')
    const resolution = resolveCredential(mode, asStringRecord(row.credentialEnv), credentialFieldsFor(row.provider))
    return {
      channel: row,
      provider: row.provider,
      config: asObject(row.config),
      credentialMode: mode,
      credentials: resolution.values,
      credentialConfigured: resolution.configured,
      missingCredentials: resolution.missing,
      dryRun: !resolution.configured && process.env.NODE_ENV !== 'production',
    }
  }

  /** 测试发送正文：显式 body 优先，否则取模板当前发布版本并渲染 */
  private async buildTestMessage(
    runtime: ChannelRuntime,
    dto: TestSendDto,
  ): Promise<{ subject?: string; body: string; templateCode: string; variables: Record<string, string> }> {
    const variables = stringRecord(dto.variables)
    if (dto.body?.trim()) {
      return {
        subject: dto.subject,
        body: this.render.render(dto.body, variables),
        templateCode: dto.templateCode?.trim() || 'test',
        variables,
      }
    }
    const code = dto.templateCode?.trim()
    if (!code) throw new BadRequestException('请提供 templateCode 或 body')
    const template = await this.prisma.messageTemplate.findUnique({
      where: { code },
      include: { versions: { where: { status: 'published' }, orderBy: { version: 'desc' }, take: 1 } },
    })
    const version = template?.versions[0]
    if (!template || !version) throw new BadRequestException(`模板不存在或未发布：${code}`)
    const allowed = Array.isArray(template.variables) ? template.variables.map((v) => String(v)) : []
    this.render.assertRenderable(allowed, version.subject ?? undefined, version.body, variables)
    return {
      subject: this.render.render(version.subject ?? undefined, variables) || undefined,
      body: this.render.render(version.body, variables),
      templateCode: code,
      variables,
    }
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function asStringRecord(value: unknown): Record<string, string> {
  const source = asObject(value)
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(source)) {
    if (item != null && String(item).trim()) out[key] = String(item).trim()
  }
  return out
}

function stringRecord(value: unknown): Record<string, string> {
  return asStringRecord(value ?? {})
}

/** 非机密配置校验：必填齐备；templateMapping 必须是字符串映射 */
function validateConfig(
  input: Record<string, unknown> | undefined,
  fields: readonly { key: string; label: string; required?: boolean }[],
): Record<string, unknown> {
  const config = asObject(input ?? {})
  for (const field of fields) {
    if (!field.required) continue
    const value = config[field.key]
    if (value == null || !String(value).trim()) {
      throw new BadRequestException(`请填写${field.label}（${field.key}）`)
    }
  }
  if (config.templateMapping != null) {
    const mapping = config.templateMapping
    if (typeof mapping !== 'object' || Array.isArray(mapping)) {
      throw new BadRequestException('模板映射须为对象：{ 我方模板code: 供应商模板标识 }')
    }
  }
  return config
}

/** 凭据入参校验已收敛到 common/credentials/credential-store（validateCredentialInput）。 */

function maskRecipient(recipient: string): string {
  if (recipient.includes('@')) {
    const [name, domain] = recipient.split('@')
    return `${name.slice(0, 2)}***@${domain}`
  }
  if (/^\d{11}$/.test(recipient)) return `${recipient.slice(0, 3)}****${recipient.slice(-4)}`
  return recipient.length <= 4 ? '***' : `${recipient.slice(0, 2)}***${recipient.slice(-2)}`
}
