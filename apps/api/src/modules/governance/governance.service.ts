import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AuditService } from '../../common/audit/audit.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { NotificationService } from '../../common/notify/notification.service'
import { PrismaService } from '../../common/prisma/prisma.service'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import { formatNow } from '../../common/utils/time'
import type { ReviewAppealDto, ReviewReportDto, SavePolicyDto } from './dto/governance.dto'

@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly notify: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async reports(page = 1, pageSize = 20, status?: string, targetType?: string) {
    const where: Prisma.ReportWhereInput = {
      ...(status ? { status } : {}),
      ...(targetType ? { targetType } : {}),
    }
    const [list, total] = await Promise.all([
      this.prisma.report.findMany({ where, orderBy: { at: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.report.count({ where }),
    ])
    return { list, total }
  }

  async reviewReport(id: string, dto: ReviewReportDto, operator: string): Promise<{ code: number }> {
    const report = await this.prisma.report.findUnique({ where: { id } })
    if (!report) throw new NotFoundException('举报不存在')
    const resolution = dto.resolution.trim()
    if (!resolution) throw new BadRequestException('请填写处置说明')

    // 恢复流：已处置（resolved）举报可直接重开 review 恢复对象，不依赖新的举报提交。
    // 内容类目标（需求/文章/企业）被 hide 后无法再次成为举报对象，故由本入口承载误判恢复。
    if (report.status === 'resolved') {
      if (dto.action !== 'restore') throw new ConflictException('该举报已处理')
      await this.prisma.$transaction(async (tx) => {
        await this.applyReportAction(tx, report.targetType, report.targetId, 'restore', resolution)
      })
      await this.audit.record({
        module: '信任治理',
        action: '恢复举报对象',
        target: `${id} · ${report.targetTitle}`,
        detail: resolution,
        operator,
      })
      return { code: 0 }
    }

    if (report.status !== 'pending') throw new ConflictException('该举报已处理')
    if (dto.status === 'rejected' && dto.action && dto.action !== 'none') {
      throw new BadRequestException('驳回举报时不能调整举报对象')
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.report.updateMany({
        where: { id, status: 'pending' },
        data: { status: dto.status, resolution, handledAt: formatNow(), handledBy: operator },
      })
      if (claimed.count !== 1) throw new ConflictException('该举报已处理')
      if (dto.action === 'hide') {
        await this.notify.notifyContentTakedown(tx, report.targetType, report.targetId, dto.takedownReason)
      }
      await this.applyReportAction(tx, report.targetType, report.targetId, dto.action ?? 'none', resolution)
    })
    await this.notify.pushNotice(report.reporterId, {
      type: 'report',
      title: dto.status === 'resolved' ? '举报已处理' : '举报处理结果',
      content: `${report.targetTitle}：${resolution}`,
      link: '/me/reports',
    })
    await this.audit.record({ module: '信任治理', action: '处置举报', target: `${id} · ${report.targetTitle}`, detail: JSON.stringify({ resolution, action: dto.action ?? 'none', takedownReason: dto.action === 'hide' ? dto.takedownReason?.trim() || null : null }), operator })
    return { code: 0 }
  }

  async appeals(page = 1, pageSize = 20, status?: string) {
    const where: Prisma.AppealWhereInput = status ? { status } : {}
    const [list, total] = await Promise.all([
      this.prisma.appeal.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.appeal.count({ where }),
    ])
    return { list, total }
  }

  async reviewAppeal(id: number, dto: ReviewAppealDto, operator: string): Promise<{ code: number }> {
    const appeal = await this.prisma.appeal.findUnique({ where: { id } })
    if (!appeal) throw new NotFoundException('申诉不存在')
    if (appeal.status !== 'pending') throw new ConflictException('该申诉已处理')
    const resolution = dto.resolution.trim()
    if (!resolution) throw new BadRequestException('请填写复核说明')
    const accepted = dto.decision === 'accepted'
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.appeal.updateMany({
        where: { id, status: 'pending' },
        data: { status: accepted ? 'resolved' : 'rejected', resolution, handledAt: formatNow(), handledBy: operator },
      })
      if (claimed.count !== 1) throw new ConflictException('该申诉已处理')
      let changed = 0
      if (appeal.targetType === 'demand') {
        changed = (await tx.demand.updateMany({ where: { id: appeal.targetId, status: 'appealed' }, data: { status: accepted ? 'pending' : 'rejected' } })).count
      } else if (appeal.targetType === 'article') {
        changed = (await tx.article.updateMany({ where: { id: appeal.targetId, status: 'appealed' }, data: { status: accepted ? 'pending' : 'rejected' } })).count
      } else {
        throw new ConflictException('申诉目标类型无效')
      }
      if (changed !== 1) throw new ConflictException('申诉目标状态已变化，请刷新后重试')
    })
    await this.notify.pushNotice(appeal.appellantId, {
      type: 'audit_result',
      title: accepted ? '申诉复核通过' : '申诉复核结果',
      content: resolution,
    })
    await this.audit.record({ module: '信任治理', action: '复核申诉', target: `${appeal.targetType} · ${appeal.targetId}`, detail: resolution, operator })
    return { code: 0 }
  }

  async policies() {
    return this.prisma.policy.findMany({ orderBy: [{ kind: 'asc' }, { publishedAt: 'desc' }] })
  }

  async createPolicy(dto: SavePolicyDto, operator: string) {
    const data = this.policyData(dto)
    const now = formatNow()
    const policy = await this.prisma.policy.create({
      data: { id: await this.ids.next('PL'), ...data, publishedAt: now, updatedAt: now, publisher: operator },
    })
    await this.audit.record({ module: '内容管理', action: '新增社区政策', target: `${policy.id} · ${policy.title}`, operator })
    return policy
  }

  async updatePolicy(id: string, dto: SavePolicyDto, operator: string): Promise<{ code: number }> {
    const current = await this.prisma.policy.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('政策不存在')
    const data = this.policyData(dto)
    await this.prisma.policy.update({
      where: { id },
      data: { ...data, updatedAt: formatNow(), publisher: operator },
    })
    await this.audit.record({ module: '内容管理', action: '更新社区政策', target: `${id} · ${dto.title.trim()}`, operator })
    return { code: 0 }
  }

  private async applyReportAction(
    tx: Prisma.TransactionClient,
    type: string,
    targetId: string,
    action: 'none' | 'hide' | 'restore',
    resolution: string,
  ) {
    if (action === 'none') return
    let changed = 0
    if (type === 'demand') {
      changed = (await tx.demand.updateMany({
        where: { id: targetId, deletedAt: null, status: action === 'hide' ? 'published' : 'rejected' },
        data: { status: action === 'hide' ? 'rejected' : 'published' },
      })).count
    } else if (type === 'article') {
      changed = (await tx.article.updateMany({
        where: { id: targetId, deletedAt: null, status: action === 'hide' ? 'published' : 'withdrawn' },
        data: { status: action === 'hide' ? 'withdrawn' : 'published' },
      })).count
    } else if (type === 'enterprise') {
      changed = (await tx.enterprise.updateMany({
        where: { id: targetId, deletedAt: null, showcaseStatus: action === 'hide' ? 'published' : 'rejected' },
        data: { showcaseStatus: action === 'hide' ? 'rejected' : 'published' },
      })).count
    } else if (type === 'user') {
      changed = (await tx.user.updateMany({
        where: { uid: targetId, status: action === 'hide' ? 'active' : 'frozen' },
        data: action === 'hide'
          ? { status: 'frozen', frozenUntil: null, frozenReason: resolution }
          : { status: 'active', frozenUntil: null, frozenReason: null },
      })).count
    } else if (type === 'comment') {
      if (action === 'restore') throw new ConflictException('已删除评论无法恢复')
      const commentId = Number.parseInt(targetId, 10)
      if (!Number.isInteger(commentId)) throw new NotFoundException('举报目标不存在')
      const comment = await tx.articleComment.findUnique({ where: { id: commentId }, select: { articleId: true } })
      if (!comment) throw new NotFoundException('举报目标不存在')
      changed = (await tx.articleComment.deleteMany({ where: { id: commentId } })).count
      if (changed === 1) {
        await tx.article.updateMany({
          where: { id: comment.articleId, commentCount: { gt: 0 } },
          data: { commentCount: { decrement: 1 } },
        })
      }
    } else {
      throw new ConflictException('举报目标类型不支持该操作')
    }
    if (changed !== 1) throw new ConflictException('举报目标状态已变化，请刷新后重试')
  }

  private policyData(dto: SavePolicyDto) {
    const title = dto.title.trim()
    const content = sanitizeHtml(dto.content.trim()).trim()
    const version = dto.version.trim()
    if (!title) throw new BadRequestException('请填写政策标题')
    if (!content) throw new BadRequestException('请填写政策正文')
    if (!version) throw new BadRequestException('请填写政策版本')
    return {
      kind: dto.kind,
      category: dto.category?.trim() || '-',
      title,
      summary: dto.summary?.trim() || '',
      content,
      version,
      effectiveAt: dto.effectiveAt?.trim() || null,
      status: dto.status ?? 'published',
    }
  }
}
