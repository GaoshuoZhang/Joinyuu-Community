import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AuditService } from '../../common/audit/audit.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { PrismaService } from '../../common/prisma/prisma.service'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import { formatNow } from '../../common/utils/time'
import type { SaveAgreementPolicyDto, SaveCommunityPolicyDto, SavePolicyDto } from './dto/governance.dto'

type AgreementKind = 'agreement_user' | 'agreement_privacy'
type PolicyScope = 'community' | 'agreement'

@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  async policies(scope: PolicyScope) {
    return this.prisma.policy.findMany({
      where: scope === 'community' ? { kind: 'community' } : { kind: { in: ['agreement_user', 'agreement_privacy'] } },
      orderBy: [{ kind: 'asc' }, { publishedAt: 'desc' }],
    })
  }

  async createCommunityPolicy(dto: SaveCommunityPolicyDto, operator: string) {
    return this.createPolicy('community', dto, operator)
  }

  async createAgreementPolicy(dto: SaveAgreementPolicyDto, operator: string) {
    return this.createPolicy(dto.kind, dto, operator)
  }

  private async createPolicy(kind: 'community' | AgreementKind, dto: SavePolicyDto | SaveCommunityPolicyDto, operator: string) {
    const data = this.policyData(kind, dto)
    const now = formatNow()
    await this.assertAgreementVersionAvailable(data)
    const id = await this.ids.next('PL')
    const policy = await this.writePolicy(kind, () => this.prisma.policy.create({
      data: { id, ...data, publishedAt: now, updatedAt: now, publisher: operator },
    }))
    const community = kind === 'community'
    await this.audit.record({ module: community ? '内容管理' : '系统管理', action: community ? '新增社区政策' : '新增平台协议', target: `${policy.id} · ${policy.title}`, operator })
    return policy
  }

  async updateCommunityPolicy(id: string, dto: SaveCommunityPolicyDto, operator: string): Promise<{ code: number }> {
    return this.updatePolicy('community', id, dto, operator)
  }

  async updateAgreementPolicy(id: string, dto: SaveAgreementPolicyDto, operator: string): Promise<{ code: number }> {
    return this.updatePolicy('agreement', id, dto, operator)
  }

  private async updatePolicy(scope: PolicyScope, id: string, dto: SavePolicyDto | SaveCommunityPolicyDto | SaveAgreementPolicyDto, operator: string): Promise<{ code: number }> {
    const current = await this.prisma.policy.findFirst({
      where: scope === 'community' ? { id, kind: 'community' } : { id, kind: { in: ['agreement_user', 'agreement_privacy'] } },
    })
    if (!current) throw new NotFoundException('政策不存在')
    const kind = scope === 'community' ? 'community' : (dto as SaveAgreementPolicyDto).kind
    const data = this.policyData(kind, dto)
    await this.assertAgreementVersionAvailable(data, id)
    await this.writePolicy(kind, () => this.prisma.policy.update({
      where: { id },
      data: { ...data, updatedAt: formatNow(), publisher: operator },
    }))
    const community = scope === 'community'
    await this.audit.record({ module: community ? '内容管理' : '系统管理', action: community ? '更新社区政策' : '更新平台协议', target: `${id} · ${dto.title.trim()}`, operator })
    return { code: 0 }
  }

  /** 独立社区政策可同版本；已归档协议也可与发布版共存，编辑时排除当前记录。 */
  private async assertAgreementVersionAvailable(data: { kind: string; version: string; status: string }, id?: string) {
    if (data.kind === 'community' || data.status !== 'published') return
    const duplicate = await this.prisma.policy.findFirst({
      where: { kind: data.kind, version: data.version, status: 'published', ...(id ? { id: { not: id } } : {}) },
      select: { id: true },
    })
    if (duplicate) throw new ConflictException('该类型的协议版本已发布，请修改版本号或编辑已有协议')
  }

  /** 预查不能覆盖并发请求，仍由数据库约束兜底并转为业务冲突。 */
  private async writePolicy<T>(kind: string, write: () => Promise<T>): Promise<T> {
    try { return await write() }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = error.meta?.target
        const versionConflict = Array.isArray(target) ? target.includes('kind') && target.includes('version')
          : typeof target === 'string' && ['Policy_kind_version_key', 'Policy_published_kind_version_key', 'Policy_published_agreement_kind_version_key'].includes(target)
        if (versionConflict) {
          throw new ConflictException(kind === 'community'
            ? '社区政策版本约束尚未更新，请联系管理员完成数据库迁移'
            : '该类型的协议版本已发布，请修改版本号或编辑已有协议')
        }
      }
      throw error
    }
  }

  private policyData(kind: 'community' | AgreementKind, dto: SavePolicyDto | SaveCommunityPolicyDto) {
    const title = dto.title.trim()
    const content = sanitizeHtml(dto.content.trim()).trim()
    const version = dto.version.trim()
    if (!title) throw new BadRequestException('请填写政策标题')
    if (!content) throw new BadRequestException('请填写政策正文')
    if (!version) throw new BadRequestException('请填写政策版本')
    const communityDto = dto as SaveCommunityPolicyDto
    const attachments = kind === 'community' ? this.policyAttachments(communityDto.attachments) : []
    return {
      kind,
      category: kind === 'community' ? dto.category?.trim() || '-' : '-',
      title,
      summary: dto.summary?.trim() || '',
      content,
      version,
      effectiveAt: dto.effectiveAt?.trim() || null,
      attachments,
      featured: kind === 'community' ? communityDto.featured ?? false : false,
      status: dto.status ?? 'published',
    }
  }

  private policyAttachments(value?: Array<{ name: string; url: string }>) {
    if (!value) return []
    return value.map((attachment) => {
      const name = typeof attachment?.name === 'string' ? attachment.name.trim() : ''
      const url = typeof attachment?.url === 'string' ? attachment.url.trim() : ''
      if (!name || !url || name.length > 128 || url.length > 1000 || !/^(https?:\/\/|\/(?!\/))/.test(url)) {
        throw new BadRequestException('政策附件名称或地址无效')
      }
      return { name, url }
    })
  }
}
