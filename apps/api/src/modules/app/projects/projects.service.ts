import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Milestone, Project, ProjectUndertaker } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { formatNow } from '../../../common/utils/time'
import type { SubmitMilestoneDto } from './dto/submit-milestone.dto'
import type { ReturnMilestoneDto } from './dto/return-milestone.dto'
import { StorageService } from '../../../common/storage/storage.service'
import { ProjectMilestoneReviewService } from '../../projects/project-milestone-review.service'

interface LoadedProject {
  project: Project & { undertakers: ProjectUndertaker[]; milestones: Milestone[] }
  isInit: boolean
  isDemander: boolean
  canSubmit: boolean
  initiatorUid: string | null
}

/* 项目履约（/api/app/me/projects）：
 * 我发起的/承接的项目列表与详情、里程碑提交/验收/退回（验收自动结项并发经验）。 */

@Injectable()
export class AppProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly notify: NotificationService,
    private readonly storage: StorageService,
    private readonly reviews: ProjectMilestoneReviewService,
  ) {}

  /** 我发起或参与的承接项目列表 */
  async myProjects(uid: string) {
    const myEntIds = await this.myEnterpriseIds(uid)
    const myDemandIds = await this.prisma.demand.findMany({
      where: { publisherId: { in: [uid, ...myEntIds] } }, select: { id: true },
    })
    /* 需求方主体：本人 + 我关联的社区企业（企业代发的需求立项后，企业成员同样可见） */
    const demanderSubjects = [uid, ...myEntIds]
    const matched = {
      OR: [
        { type: 'individual', refId: uid },
        { type: 'custom', refId: uid },
        ...myEntIds.map((id) => ({ type: 'enterprise', refId: id })),
      ],
    }
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        OR: [
          { undertakers: { some: matched } },
          { sourceDemandId: { in: myDemandIds.map((d) => d.id) } },
          { demanderId: { in: demanderSubjects } },
        ],
      },
      include: { undertakers: true, milestones: { orderBy: { id: 'asc' } } },
      orderBy: { initiatedAt: 'desc' },
    })
    const demandIds = new Set(myDemandIds.map((d) => d.id))
    const subjectSet = new Set(demanderSubjects)
    return Promise.all(
      projects.map((p) =>
        this.toMyProject(
          uid,
          p,
          subjectSet.has(p.demanderId ?? '') || demandIds.has(p.sourceDemandId ?? ''),
          myEntIds,
        ),
      ),
    )
  }

  /** 项目详情（参与双方可看；含来源需求、参与人快照与里程碑） */
  async projectDetail(uid: string, id: string) {
    const { project, isInit, isDemander, canSubmit } = await this.loadProject(uid, id)
    const sourceDemand = project.sourceDemandId
      ? await this.prisma.demand.findUnique({ where: { id: project.sourceDemandId } })
      : null
    const myEntIds = await this.myEnterpriseIds(uid)
    const { role, enterpriseName, enterpriseId } = isDemander
      ? { role: '需求发起方' as const, enterpriseName: undefined, enterpriseId: undefined }
      : this.roleOf(uid, project, myEntIds)

    return {
      id: project.id,
      name: project.name,
      code: project.code,
      status: project.status,
      progress: project.progress,
      startDate: project.startDate,
      endDate: project.endDate,
      description: project.description,
      memberCount: project.memberCount,
      role,
      demanderName: project.demanderName ?? sourceDemand?.publisherName ?? undefined,
      canSubmit,
      canAccept: isInit,
      ...(enterpriseName ? { enterpriseName } : {}),
      ...(enterpriseId ? { enterpriseId } : {}),
      ...(project.sourceDemandId ? { sourceDemandId: project.sourceDemandId } : {}),
      ...(project.finishedAt ? { finishedAt: project.finishedAt } : {}),
      /* 对端展示名（D-108）：发起方看承接方，承接方看需求发布者（历史项目无来源需求时为 undefined） */
      ...(isDemander
        ? { partnerName: project.undertakers.map((u) => u.name).join('、') || undefined }
        : { partnerName: project.demanderName ?? sourceDemand?.publisherName ?? undefined }),
      sourceDemand: sourceDemand
        ? {
            id: sourceDemand.id,
            title: sourceDemand.title,
            category: sourceDemand.category,
            kind: (sourceDemand.demandType ?? 'task') as 'task' | 'investment' | 'cooperation',
            publisherName: sourceDemand.publisherName,
          }
        : null,
      participants: project.undertakers.map((u) => ({
        type: u.type,
        id: u.refId,
        name: u.name,
        share: u.share,
        ...(u.contactName ? { contactName: u.contactName } : {}),
        ...(u.phone ? { phone: u.phone } : {}),
      })),
      milestones: project.milestones.map((m) => this.toMilestone(m, project.id)),
    }
  }

  /** 承接方提交里程碑（发起方 403；todo / returned → submitted） */
  async submitMilestone(uid: string, projectId: string, milestoneId: string, dto: SubmitMilestoneDto) {
    const { project, canSubmit, initiatorUid } = await this.loadProject(uid, projectId)
    if (!canSubmit) throw new ForbiddenException('仅承接方可以提交里程碑')
    const mil = project.milestones.find((m) => String(m.id) === milestoneId)
    if (!mil) throw new NotFoundException('里程碑不存在')
    if (mil.status !== 'todo' && mil.status !== 'returned') throw new ConflictException('该里程碑当前不可提交')

    const updated = await this.prisma.milestone.updateMany({
      where: { id: mil.id, status: { in: ['todo', 'returned'] } },
      data: {
        status: 'submitted',
        submitAt: formatNow(),
        attachments: dto.attachments ?? mil.attachments,
        returnReason: null,
        returnedAt: null,
      },
    })
    if (updated.count !== 1) throw new ConflictException('里程碑状态已变更，请刷新后重试')
    if (initiatorUid) {
      await this.notify.pushNotice(initiatorUid, {
        type: 'project',
        title: '里程碑已提交',
        content: `「${mil.name}」已提交交付，请及时验收。`,
        link: `/me/projects/${project.id}`,
      })
    }
    return { code: 0 }
  }

  /** 发起方验收里程碑；全部验收通过自动结项并发经验。
   * 状态迁移/积分/结项与后台「进度节点」共用 ProjectMilestoneReviewService，避免双端漂移。 */
  async acceptMilestone(uid: string, projectId: string, milestoneId: string) {
    const { isInit, initiatorUid } = await this.loadProject(uid, projectId)
    if (!isInit) throw new ForbiddenException('仅发起方可以验收里程碑')
    await this.reviews.acceptMilestone(projectId, milestoneId, initiatorUid)
    return { code: 0 }
  }

  /** 发起方退回里程碑（承接方可重新提交） */
  async returnMilestone(uid: string, projectId: string, milestoneId: string, dto: ReturnMilestoneDto) {
    const { isInit } = await this.loadProject(uid, projectId)
    if (!isInit) throw new ForbiddenException('仅发起方可以退回里程碑')
    const reason = (dto.reason ?? '').trim()
    if (!reason) throw new BadRequestException('请填写退回原因')
    await this.reviews.returnMilestone(projectId, milestoneId, reason)
    return { code: 0 }
  }

  /** 里程碑证据同样按项目参与方鉴权，避免上传后经 public files 绕过权限。 */
  async readAttachment(uid: string, projectId: string, storeKey: string) {
    const { project } = await this.loadProject(uid, projectId)
    if (!project.milestones.some((milestone) => milestone.attachments.includes(storeKey))) {
      throw new NotFoundException('附件不存在')
    }
    const buffer = await this.storage.read(storeKey)
    if (!buffer) throw new NotFoundException('附件不存在')
    return { buffer, name: storeKey }
  }

  /* ---------- 内部工具 ---------- */

  private async loadProject(uid: string, projectId: string): Promise<LoadedProject> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { undertakers: true, milestones: { orderBy: { id: 'asc' } } },
    })
    if (!project || project.deletedAt) throw new NotFoundException('项目不存在')

    let initiatorUid: string | null = null
    let isInit = false
    const demand = project.sourceDemandId
      ? await this.prisma.demand.findUnique({ where: { id: project.sourceDemandId } })
      : null
    /* 需求方主体：优先项目快照（demanderId），历史项目回退来源需求的发布方；
     * 企业代发需求时主体为企业 ID，解析到该企业联系人（即收到「需求已达成合作」的用户）后放行 */
    const demanderSubject = project.demanderId ?? demand?.publisherId ?? null
    initiatorUid = await this.reviews.resolveSubjectUserId(demanderSubject)
    isInit = (!!initiatorUid && initiatorUid === uid) || demand?.publisherId === uid
    const myEntIds = await this.myEnterpriseIds(uid)
    const isDemander = isInit || demanderSubject === uid || myEntIds.includes(demanderSubject ?? '')
    const isUnd = project.undertakers.some((u) =>
      (u.type === 'individual' && u.refId === uid) ||
      (u.type === 'custom' && u.refId === uid) ||
      (u.type === 'enterprise' && myEntIds.includes(u.refId)),
    )
    if (!isDemander && !isUnd) throw new ForbiddenException('您无权访问该项目')
    return { project, isInit, isDemander, canSubmit: isUnd && !isDemander, initiatorUid }
  }

  private async myEnterpriseIds(uid: string): Promise<string[]> {
    const rows = await this.prisma.userIdentity.findMany({
      where: { userId: uid, type: 'community_enterprise', enterpriseId: { not: null } },
      select: { enterpriseId: true },
    })
    return rows.map((r) => r.enterpriseId as string)
  }

  /** 项目在「我的项目」列表中的承接角色 */
  private roleOf(uid: string, project: Project & { undertakers: ProjectUndertaker[] }, myEntIds: string[]) {
    const matched = project.undertakers.filter(
      (u) =>
        (u.type === 'individual' && u.refId === uid) ||
        (u.type === 'custom' && u.refId === uid) ||
        (u.type === 'enterprise' && myEntIds.includes(u.refId)),
    )
    if (matched.some((u) => u.type === 'enterprise')) {
      const e = matched.find((u) => u.type === 'enterprise')
      return { role: '企业承接' as const, enterpriseName: e?.name, enterpriseId: e?.refId }
    }
    if (matched.length > 0) return { role: '本人承接' as const, enterpriseName: undefined, enterpriseId: undefined }
    return { role: '需求发起方' as const, enterpriseName: undefined, enterpriseId: undefined }
  }

  private async toMyProject(
    uid: string,
    project: Project & { undertakers: ProjectUndertaker[]; milestones: Array<{ id: number; name: string; status: string; date: string; owners: string[]; attachments: string[]; returnReason: string | null; submitAt: string | null; acceptAt: string | null; returnedAt: string | null }> },
    isInitiator: boolean,
    myEntIds: string[],
  ) {
    const roleInfo = isInitiator
      ? { role: '需求发起方' as const, enterpriseName: undefined, enterpriseId: undefined }
      : this.roleOf(uid, project, myEntIds)

    /* 对方 = 非我方承接方（需求立项生成两个承接方：发起方 + 承接方） */
    const matchesMe = (u: ProjectUndertaker) =>
      (u.type === 'individual' && u.refId === uid) ||
      (u.type === 'custom' && u.refId === uid) ||
      (u.type === 'enterprise' && myEntIds.includes(u.refId))
    const partner = project.undertakers.find((u) => !matchesMe(u))
    /* 归属标记：客户端「我的项目」按「我承接的 / 我发起的」分标签页；
     * 两者可同时为真（既发起又承接），故不用互斥的 role 代替 */
    const isUndertaker = project.undertakers.some(matchesMe)
    /* 对方承接方姓名口径：企业 → 企业名；个人 → 真实姓名（昵称）——同名承接方在项目里可区分（不下发用户 ID） */
    let partnerName: string | undefined
    if (partner) {
      partnerName = partner.name
      if (partner.type === 'individual' && partner.refId) {
        const pu = await this.prisma.user.findUnique({
          where: { uid: partner.refId },
          select: { realName: true, nickname: true },
        })
        if (pu) partnerName = `${pu.realName || pu.nickname}（${pu.nickname}）`
      }
    }

    return {
      id: project.id,
      name: project.name,
      role: roleInfo.role,
      isInitiator,
      isUndertaker,
      ...(roleInfo.enterpriseName ? { enterpriseName: roleInfo.enterpriseName } : {}),
      ...(roleInfo.enterpriseId ? { enterpriseId: roleInfo.enterpriseId } : {}),
      ...(project.sourceDemandId ? { sourceDemandId: project.sourceDemandId } : {}),
      ...(partnerName ? { partnerName } : {}),
      progress: project.progress,
      milestones: project.milestones.map((m) => this.toMilestone(m, project.id)),
      /* 结项时间优先取真实结项时间；历史数据回退到归档计时（D-109） */
      ...(project.status === 'finished'
        ? { finishedAt: project.finishedAt ?? project.archivableAt ?? undefined }
        : {}),
    }
  }

  private toMilestone(m: {
    id: number
    name: string
    status: string
    attachments: string[]
    returnReason: string | null
    submitAt: string | null
    acceptAt: string | null
  }, projectId: string) {
    const result: Record<string, unknown> = {
      id: String(m.id),
      title: m.name,
      done: m.status === 'accepted',
      status: m.status === 'returned' ? 'todo' : (m.status as 'todo' | 'submitted' | 'accepted'),
    }
    if (m.submitAt) result.submittedAt = m.submitAt
    if (m.returnReason) result.returnReason = m.returnReason
    if (m.acceptAt) result.acceptedAt = m.acceptAt
    if (m.attachments && m.attachments.length > 0) {
      result.attachments = m.attachments.map((k) => ({
        name: k,
        url: `/api/app/me/projects/${projectId}/attachments/${encodeURIComponent(k)}/download`,
      }))
    }
    return result
  }
}
