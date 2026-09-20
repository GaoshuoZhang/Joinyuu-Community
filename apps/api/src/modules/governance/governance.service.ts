import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
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
    const policy = await this.prisma.policy.create({
      data: { id: await this.ids.next('PL'), ...data, publishedAt: now, updatedAt: now, publisher: operator },
    })
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
    await this.prisma.policy.update({
      where: { id },
      data: { ...data, updatedAt: formatNow(), publisher: operator },
    })
    const community = scope === 'community'
    await this.audit.record({ module: community ? '内容管理' : '系统管理', action: community ? '更新社区政策' : '更新平台协议', target: `${id} · ${dto.title.trim()}`, operator })
    return { code: 0 }
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
