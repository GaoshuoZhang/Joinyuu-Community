import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, type MessageTemplate, type MessageTemplateVersion } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow } from '../../common/utils/time'
import { MessageChannelService } from './message-channel.service'
import { MessageRenderService } from './message-render.service'
import { MessageProviderRegistry } from './providers/provider.registry'
import type { ChannelKind } from './messaging.types'
import type {
  CreateTemplateDto,
  PreviewTemplateDto,
  PublishTemplateDto,
  ReviewTemplateDto,
  SaveTemplateDraftDto,
  TestTemplateDto,
} from './dto/message-template.dto'

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/

/* 消息模板（P0）：变量白名单 + 版本化（创建即发布、保存即发布）+ 历史版本回滚 + 测试发送。
 * 提交/审核/发布接口保留（兼容旧流程与 e2e），但管理端不再使用——编辑保存即对当前发布版本生效。 */
@Injectable()
export class MessageTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly render: MessageRenderService,
    private readonly channels: MessageChannelService,
    private readonly registry: MessageProviderRegistry,
  ) {}

  async list(): Promise<Record<string, unknown>[]> {
    const rows = await this.prisma.messageTemplate.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      include: { versions: { where: { status: 'published' }, take: 1, orderBy: { version: 'desc' } } },
    })
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      category: row.category,
      status: row.status,
      currentVersion: row.currentVersion,
      variables: variableList(row.variables),
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      publishedSubject: row.versions[0]?.subject ?? null,
      publishedBody: row.versions[0]?.body ?? null,
    }))
  }

  async detail(id: string): Promise<Record<string, unknown>> {
    const template = await this.prisma.messageTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' } } },
    })
    if (!template) throw new NotFoundException('模板不存在')
    return {
      id: template.id,
      code: template.code,
      name: template.name,
      kind: template.kind,
      category: template.category,
      status: template.status,
      currentVersion: template.currentVersion,
      variables: variableList(template.variables),
      updatedAt: template.updatedAt,
      updatedBy: template.updatedBy,
      versions: template.versions.map(toVersionDto),
    }
  }

  async create(dto: CreateTemplateDto, operator: string): Promise<{ id: string }> {
    const code = dto.code.trim()
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(code)) {
      throw new BadRequestException('模板编码须为小写字母开头，仅含小写字母/数字/下划线')
    }
    const variables = validateVariables(dto.variables)
    this.render.assertTemplate(variables, dto.subject, dto.body)

    const existing = await this.prisma.messageTemplate.findUnique({ where: { code } })
    if (existing) throw new ConflictException('该模板编码已存在')

    const id = await this.ids.next('MT')
    const versionId = await this.ids.next('MV')
    const now = formatNow()
    try {
      await this.prisma.$transaction([
        this.prisma.messageTemplate.create({
          data: {
            id,
            code,
            name: dto.name.trim(),
            kind: dto.kind,
            category: dto.category,
            variables,
            status: 'published',
            currentVersion: 1,
            updatedAt: now,
            updatedBy: operator,
          },
        }),
        this.prisma.messageTemplateVersion.create({
          data: {
            id: versionId,
            templateId: id,
            version: 1,
            subject: dto.subject?.trim() || null,
            body: dto.body,
            status: 'published',
            createdBy: operator,
            createdAt: now,
          },
        }),
      ])
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('该模板编码已存在')
      }
      throw error
    }
    await this.audit.record({
      module: '消息中心',
      action: '新增消息模板',
      target: `${dto.name.trim()}（${code}）`,
      detail: `类型 ${dto.kind} · 分类 ${dto.category} · 变量 ${variables.length} 个 · 已发布 v1`,
      operator,
    })
    return { id }
  }

  /** 保存并发布：修改当前发布版本正文并立即生效（无发布版本时新建 v+1 发布）。
   * 历史版本保留（重新发布历史版本即回滚）。 */
  async saveDraft(id: string, dto: SaveTemplateDraftDto, operator: string): Promise<{ version: number }> {
    const template = await this.require(id)
    const variables = validateVariables(dto.variables)
    this.render.assertTemplate(variables, dto.subject, dto.body)

    const now = formatNow()
    const subject = dto.subject?.trim() || null

    /* 版本写入与模板状态更新同事务，避免中途失败导致版本与模板状态不一致 */
    const version = await this.prisma.$transaction(async (tx) => {
      await this.lockTemplate(tx, id)
      const latestPublished = await tx.messageTemplateVersion.findFirst({
        where: { templateId: id, status: 'published' },
        orderBy: { version: 'desc' },
      })

      let nextVersion: number
      if (latestPublished) {
        await tx.messageTemplateVersion.update({
          where: { id: latestPublished.id },
          data: { subject, body: dto.body },
        })
        nextVersion = latestPublished.version
      } else {
        const max = await tx.messageTemplateVersion.findFirst({
          where: { templateId: id },
          orderBy: { version: 'desc' },
        })
        nextVersion = (max?.version ?? 0) + 1
        await tx.messageTemplateVersion.create({
          data: {
            id: await this.ids.next('MV', tx),
            templateId: id,
            version: nextVersion,
            subject,
            body: dto.body,
            status: 'published',
            createdBy: operator,
            createdAt: now,
          },
        })
      }

      await tx.messageTemplate.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          category: dto.category,
          variables,
          status: 'published',
          currentVersion: nextVersion,
          updatedAt: now,
          updatedBy: operator,
        },
      })
      return nextVersion
    })

    await this.audit.record({
      module: '消息中心',
      action: '保存并发布消息模板',
      target: `${dto.name.trim()}（${template.code}）`,
      detail: `版本 v${version} · 变量 ${variables.length} 个`,
      operator,
    })
    return { version }
  }

  async submit(id: string, operator: string): Promise<{ version: number }> {
    const template = await this.require(id)
    const draft = await this.prisma.messageTemplateVersion.findFirst({
      where: { templateId: id, status: 'draft' },
      orderBy: { version: 'desc' },
    })
    if (!draft) throw new BadRequestException('没有待提交的草稿版本')
    await this.prisma.messageTemplateVersion.update({
      where: { id: draft.id },
      data: { status: 'pending' },
    })
    await this.audit.record({
      module: '消息中心',
      action: '提交消息模板审核',
      target: `${template.name}（${template.code}）`,
      detail: `版本 v${draft.version}`,
      operator,
    })
    return { version: draft.version }
  }

  async review(id: string, dto: ReviewTemplateDto, operator: string): Promise<{ version: number }> {
    const template = await this.require(id)
    const pending = await this.prisma.messageTemplateVersion.findFirst({
      where: { templateId: id, status: 'pending' },
      orderBy: { version: 'desc' },
    })
    if (!pending) throw new BadRequestException('没有待审核的版本')
    if (!dto.approve && !dto.note?.trim()) throw new BadRequestException('驳回时必须填写原因')

    await this.prisma.messageTemplateVersion.update({
      where: { id: pending.id },
      data: {
        status: dto.approve ? 'approved' : 'rejected',
        reviewedBy: operator,
        reviewedAt: formatNow(),
        reviewNote: dto.note?.trim() || null,
      },
    })
    await this.audit.record({
      module: '消息中心',
      action: dto.approve ? '审核通过消息模板' : '驳回消息模板',
      target: `${template.name}（${template.code}）`,
      detail: `版本 v${pending.version}${dto.note ? ` · ${dto.note.trim()}` : ''}`,
      operator,
    })
    return { version: pending.version }
  }

  /** 发布：approved 版本可发布；历史 archived 版本可发布（即回滚）；旧发布版本转 archived */
  async publish(id: string, dto: PublishTemplateDto, operator: string): Promise<{ version: number }> {
    const template = await this.require(id)
    const now = formatNow()
    const target = await this.prisma.$transaction(async (tx) => {
      await this.lockTemplate(tx, id)
      const target = await this.resolvePublishable(id, dto.version, tx)
      await tx.messageTemplateVersion.updateMany({
        where: { templateId: id, status: 'published' },
        data: { status: 'archived' },
      })
      await tx.messageTemplateVersion.update({
        where: { id: target.id },
        data: { status: 'published' },
      })
      await tx.messageTemplate.update({
        where: { id },
        data: { status: 'published', currentVersion: target.version, updatedAt: now, updatedBy: operator },
      })
      return target
    })
    await this.audit.record({
      module: '消息中心',
      action: target.version === template.currentVersion ? '重新发布消息模板' : '发布消息模板',
      target: `${template.name}（${template.code}）`,
      detail: `版本 v${target.version}${template.currentVersion > 0 && template.currentVersion !== target.version ? `（原 v${template.currentVersion}）` : ''}`,
      operator,
    })
    return { version: target.version }
  }

  /** 下架：撤销发布状态（版本转为 archived，模板回到 draft） */
  async disable(id: string, operator: string): Promise<{ code: number }> {
    const template = await this.require(id)
    if (template.currentVersion === 0) throw new BadRequestException('模板尚未发布')
    await this.prisma.$transaction(async (tx) => {
      await this.lockTemplate(tx, id)
      await tx.messageTemplateVersion.updateMany({
        where: { templateId: id, status: 'published' },
        data: { status: 'archived' },
      })
      await tx.messageTemplate.update({
        where: { id },
        data: { status: 'draft', updatedAt: formatNow(), updatedBy: operator },
      })
    })
    await this.audit.record({
      module: '消息中心',
      action: '下架消息模板',
      target: `${template.name}（${template.code}）`,
      detail: `原版本 v${template.currentVersion}`,
      operator,
    })
    return { code: 0 }
  }

  /** 测试发送：按模板类型取已启用渠道；凭据缺失时非生产环境降级干跑 */
  async testSend(
    id: string,
    dto: TestTemplateDto,
    operator: string,
  ): Promise<{
    providerMessageId?: string
    dryRun: boolean
    costMs: number
    warnings: string[]
    rendered: { subject?: string; body: string }
  }> {
    const template = await this.require(id)
    const version = await this.resolveVersion(id, dto.version)
    const variables = stringRecord(dto.variables ?? {})
    const allowed = variableList(template.variables)
    this.render.assertRenderable(allowed, version.subject ?? undefined, version.body, variables)

    const rendered = {
      subject: this.render.render(version.subject ?? undefined, variables) || undefined,
      body: this.render.render(version.body, variables),
    }

    const runtime = await this.channels.resolveFor(template.kind as ChannelKind)
    if (!runtime) throw new BadRequestException(`没有已启用的 ${template.kind} 渠道，请先在「渠道配置」启用`)

    const provider = runtime.dryRun ? this.registry.dryRun() : this.registry.resolve(runtime.provider)
    const startedAt = Date.now()
    try {
      const result = await provider.send({
        recipient: dto.recipient.trim(),
        subject: rendered.subject,
        body: rendered.body,
        templateCode: template.code,
        variables,
        config: runtime.config,
        credentials: runtime.credentials,
      })
      const costMs = Date.now() - startedAt
      await this.audit.record({
        module: '消息中心',
        action: '测试发送消息模板',
        target: `${template.name}（${template.code}）`,
        detail: `版本 v${version.version} · ${runtime.dryRun ? '干跑' : '真实发送'} · ${costMs}ms`,
        operator,
      })
      return {
        providerMessageId: result.providerMessageId,
        dryRun: runtime.dryRun,
        costMs,
        warnings: result.warnings ?? [],
        rendered,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.audit.record({
        module: '消息中心',
        action: '测试发送消息模板失败',
        target: `${template.name}（${template.code}）`,
        detail: message.slice(0, 255),
        operator,
      })
      throw new BadRequestException(`测试发送失败：${message}`)
    }
  }

  /** 预览渲染结果（不发送） */
  async preview(id: string, dto: PreviewTemplateDto): Promise<{ subject?: string; body: string }> {
    const template = await this.require(id)
    const version = dto.draft ?? await this.resolveVersion(id, dto.version)
    const variables = stringRecord(dto.variables ?? {})
    const allowed = dto.draft?.variables ?? variableList(template.variables)
    this.render.assertTemplate(allowed, version.subject ?? undefined, version.body)
    this.render.assertRenderable(
      allowed,
      version.subject ?? undefined,
      version.body,
      variables,
    )
    return {
      subject: this.render.render(version.subject ?? undefined, variables) || undefined,
      body: this.render.render(version.body, variables),
    }
  }

  /* ---------- 内部工具 ---------- */

  private async require(id: string): Promise<MessageTemplate> {
    const template = await this.prisma.messageTemplate.findUnique({ where: { id } })
    if (!template) throw new NotFoundException('模板不存在')
    return template
  }

  private async resolveVersion(id: string, version?: number): Promise<MessageTemplateVersion> {
    const row = version
      ? await this.prisma.messageTemplateVersion.findFirst({ where: { templateId: id, version } })
      : await this.prisma.messageTemplateVersion.findFirst({
          where: { templateId: id, status: 'published' },
          orderBy: { version: 'desc' },
        })
    if (!row) throw new NotFoundException(version ? `版本 v${version} 不存在` : '模板尚未发布')
    return row
  }

  /** 可发布版本：指定版本须为 approved/archived；缺省取最新 approved */
  /** 保存、发布、下架共用同一父记录锁，避免同时分配相同版本或产生两个发布版本。 */
  private async lockTemplate(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "MessageTemplate" WHERE "id" = ${id} FOR UPDATE`
    if (!rows.length) throw new NotFoundException('模板不存在')
  }

  private async resolvePublishable(id: string, version?: number, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<MessageTemplateVersion> {
    const row = version
      ? await db.messageTemplateVersion.findFirst({ where: { templateId: id, version } })
      : await db.messageTemplateVersion.findFirst({
          where: { templateId: id, status: 'approved' },
          orderBy: { version: 'desc' },
        })
    if (!row) {
      throw new BadRequestException(version ? `版本 v${version} 不存在` : '没有已通过审核的版本可发布')
    }
    if (!['approved', 'archived'].includes(row.status)) {
      throw new BadRequestException(`版本 v${row.version} 当前状态为 ${row.status}，不可发布（需先通过审核）`)
    }
    return row
  }
}

function variableList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : []
}

function validateVariables(input: string[]): string[] {
  const out: string[] = []
  for (const raw of input) {
    const name = raw.trim()
    if (!VARIABLE_NAME.test(name)) {
      throw new BadRequestException(`变量名不合法：${raw}（字母/下划线开头，仅含字母/数字/下划线）`)
    }
    if (!out.includes(name)) out.push(name)
  }
  return out
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = item == null ? '' : String(item)
  }
  return out
}

function toVersionDto(version: MessageTemplateVersion): Record<string, unknown> {
  return {
    id: version.id,
    version: version.version,
    subject: version.subject,
    body: version.body,
    status: version.status,
    reviewedBy: version.reviewedBy,
    reviewedAt: version.reviewedAt,
    reviewNote: version.reviewNote,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
  }
}
