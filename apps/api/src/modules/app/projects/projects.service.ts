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
import { PointsEngineService } from '../../../common/engine/points-engine/points-engine.service'
import { formatNow } from '../../../common/utils/time'
import type { SubmitMilestoneDto } from './dto/submit-milestone.dto'
import type { ReturnMilestoneDto } from './dto/return-milestone.dto'
import { StorageService } from '../../../common/storage/storage.service'

interface LoadedProject {
  project: Project & { undertakers: ProjectUndertaker[]; milestones: Milestone[] }
  isInit: boolean
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
    private readonly points: PointsEngineService,
    private readonly storage: StorageService,
  ) {}

  /** 我发起或参与的承接项目列表 */
  async myProjects(uid: string) {
    const [myDemandIds, myEntIds] = await Promise.all([
      this.prisma.demand.findMany({ where: { publisherId: uid }, select: { id: true } }),
      this.myEnterpriseIds(uid),
    ])
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
          p.demanderId != null ? subjectSet.has(p.demanderId) : demandIds.has(p.sourceDemandId ?? ''),
          myEntIds,
        ),
      ),
    )
  }

  /** 项目详情（参与双方可看；含来源需求、参与人快照与里程碑） */
  async projectDetail(uid: string, id: string) {
    const { project, isInit } = await this.loadProject(uid, id)
    const sourceDemand = project.sourceDemandId
      ? await this.prisma.demand.findUnique({ where: { id: project.sourceDemandId } })
      : null
    const myEntIds = await this.myEnterpriseIds(uid)
    const { role, enterpriseName, enterpriseId } = isInit
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
      ...(enterpriseName ? { enterpriseName } : {}),
      ...(enterpriseId ? { enterpriseId } : {}),
      ...(project.sourceDemandId ? { sourceDemandId: project.sourceDemandId } : {}),
      ...(project.finishedAt ? { finishedAt: project.finishedAt } : {}),
      /* 对端展示名（D-108）：发起方看承接方，承接方看需求发布者（历史项目无来源需求时为 undefined） */
      ...(isInit
        ? { partnerName: project.undertakers.map((u) => u.name).join('、') || undefined }
        : { partnerName: sourceDemand?.publisherName ?? undefined }),
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
    const { project, isInit, initiatorUid } = await this.loadProject(uid, projectId)
    if (isInit) throw new ForbiddenException('发起方不能提交里程碑')
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

  /** 发起方验收里程碑；全部验收通过自动结项并发经验 */
  async acceptMilestone(uid: string, projectId: string, milestoneId: string) {
    const { project, isInit, initiatorUid } = await this.loadProject(uid, projectId)
    if (!isInit) throw new ForbiddenException('仅发起方可以验收里程碑')
    const mil = project.milestones.find((m) => String(m.id) === milestoneId)
    if (!mil) throw new NotFoundException('里程碑不存在')
    if (mil.status !== 'submitted') throw new ConflictException('该里程碑未提交，无法验收')

    const now = formatNow()
    const respondentUids = await this.respondentUids(project.sourceDemandId)
    let finished = false

    /* 状态迁移 + 里程碑通过积分 + 重算进度/结项 + 结项经验同事务，
     * 避免并发覆盖与「已退回但仍发经验 / progress 与真实通过数不符」 */
    await this.prisma.$transaction(async (tx) => {
      /* 条件更新做幂等守卫：并发/重复验收只会命中一次状态迁移 */
      const updated = await tx.milestone.updateMany({
        where: { id: mil.id, status: 'submitted' },
        data: { status: 'accepted', acceptAt: now },
      })
      if (updated.count !== 1) throw new ConflictException('里程碑状态已变更，请刷新后重试')

      /* 多选承接方时逐个发放（幂等键按里程碑+承接方去重） */
      for (const uid of respondentUids) {
        await this.points.issuePointsInTransaction(tx, uid, 'project_milestone', '项目里程碑通过验收', `project_milestone:${mil.id}:${uid}`)
      }

      const all = await tx.milestone.findMany({ where: { projectId: project.id } })
      const acceptedCount = all.filter((m) => m.status === 'accepted').length
      if (all.length > 0 && acceptedCount === all.length) {
        await tx.project.update({
          where: { id: project.id },
          data: { status: 'finished', progress: 100, archivableAt: now, finishedAt: now },
        })
        finished = true
        /* 结项经验（wiki §8.5）：按承接占比分配，总额 = 项目 expReward ?? project_completed 规则值 */
        await this.points.issueProjectFinishExperienceInTransaction(tx, project.name, project.expReward, project.undertakers)
      } else {
        await tx.project.update({
          where: { id: project.id },
          data: { progress: Math.round((acceptedCount / all.length) * 100) },
        })
      }
    })

    for (const uid of respondentUids) {
      await this.notify.pushNotice(uid, {
        type: 'project',
        title: '里程碑已验收',
        content: `「${mil.name}」已通过验收。`,
        link: `/me/projects/${project.id}`,
      })
    }

    if (finished) {
      const title = '项目已结项'
      if (initiatorUid) {
        await this.notify.pushNotice(initiatorUid, { type: 'project', title, content: '「' + project.name + '」已完成全部里程碑，顺利结项。', link: `/me/projects/${project.id}` })
      }
      for (const uid of respondentUids) {
        await this.notify.pushNotice(uid, { type: 'project', title, content: '「' + project.name + '」已完成全部里程碑，顺利结项。', link: `/me/projects/${project.id}` })
      }
    }
    return { code: 0 }
  }

  /** 发起方退回里程碑（承接方可重新提交） */
  async returnMilestone(uid: string, projectId: string, milestoneId: string, dto: ReturnMilestoneDto) {
    const { project, isInit } = await this.loadProject(uid, projectId)
    if (!isInit) throw new ForbiddenException('仅发起方可以退回里程碑')
    const mil = project.milestones.find((m) => String(m.id) === milestoneId)
    if (!mil) throw new NotFoundException('里程碑不存在')
    if (mil.status !== 'submitted') throw new ConflictException('该里程碑未提交，无法退回')
    const reason = (dto.reason ?? '').trim()
    if (!reason) throw new BadRequestException('请填写退回原因')

    const returned = await this.prisma.milestone.updateMany({
      where: { id: mil.id, status: 'submitted' },
      data: { status: 'returned', returnReason: reason, returnedAt: formatNow() },
    })
    if (returned.count !== 1) throw new ConflictException('里程碑状态已变更，请刷新后重试')
    const respondentUids = await this.respondentUids(project.sourceDemandId)
    for (const uid of respondentUids) {
      await this.notify.pushNotice(uid, {
        type: 'project',
        title: '里程碑被退回',
        content: `「${mil.name}」未通过验收，原因：${reason}，请修改后重新提交。`,
        link: `/me/projects/${project.id}`,
      })
    }
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
    initiatorUid = await this.subjectUserId(demanderSubject)
    isInit = (!!initiatorUid && initiatorUid === uid) || demand?.publisherId === uid
    const myEntIds = await this.myEnterpriseIds(uid)
    const isUnd = project.undertakers.some((u) =>
      (u.type === 'individual' && u.refId === uid) ||
      (u.type === 'custom' && u.refId === uid) ||
      (u.type === 'enterprise' && myEntIds.includes(u.refId)),
    )
    if (!isInit && !isUnd) throw new ForbiddenException('您无权访问该项目')
    return { project, isInit, initiatorUid }
  }

  private async myEnterpriseIds(uid: string): Promise<string[]> {
    const rows = await this.prisma.userIdentity.findMany({
      where: { userId: uid, type: 'community_enterprise', enterpriseId: { not: null } },
      select: { enterpriseId: true },
    })
    return rows.map((r) => r.enterpriseId as string)
  }

  /** 需求方主体 ID（用户 uid / 企业 ID）→ 对应可访问的用户 uid；无法解析返回 null。
   * 企业主体落到企业联系人：后台代企业发需求时，站内信发给联系人，项目访问也按联系人口径放行。 */
  private async subjectUserId(subjectId: string | null): Promise<string | null> {
    if (!subjectId) return null
    const user = await this.prisma.user.findUnique({ where: { uid: subjectId }, select: { uid: true } })
    if (user) return user.uid
    const enterprise = await this.prisma.enterprise.findUnique({
      where: { id: subjectId },
      select: { contactUserId: true },
    })
    return enterprise?.contactUserId ?? null
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

    return {
      id: project.id,
      name: project.name,
      role: roleInfo.role,
      ...(roleInfo.enterpriseName ? { enterpriseName: roleInfo.enterpriseName } : {}),
      ...(roleInfo.enterpriseId ? { enterpriseId: roleInfo.enterpriseId } : {}),
      ...(project.sourceDemandId ? { sourceDemandId: project.sourceDemandId } : {}),
      ...(partner ? { partnerName: partner.name } : {}),
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

  /** 承接方 uid 列表（由需求已接受的响应反查；支持多选承接方，去重且剔除空 uid） */
  private async respondentUids(sourceDemandId: string | null): Promise<string[]> {
    if (!sourceDemandId) return []
    const rows = await this.prisma.demandRespondent.findMany({
      where: { demandId: sourceDemandId, status: 'accepted', withdrawnAt: null },
      select: { userId: true },
      orderBy: { id: 'asc' },
    })
    return [...new Set(rows.map((r) => r.userId).filter((u): u is string => !!u))]
  }
}
