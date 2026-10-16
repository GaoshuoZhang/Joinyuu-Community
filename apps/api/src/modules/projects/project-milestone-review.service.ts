import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { NotificationService } from '../../common/notify/notification.service'
import { PointsEngineService } from '../../common/engine/points-engine/points-engine.service'
import { formatNow } from '../../common/utils/time'

/* 里程碑审核核心（客户端「我的项目」与后台「项目详情 > 进度节点」共用）：
 * 状态迁移 + 里程碑积分 + 进度重算 + 全部通过自动结项（含结项经验）+ 站内信。
 * 不含鉴权与审计：调用方各自负责权限判定（客户端 = 发起方；后台 = RBAC 权限码）与审计落库。 */
@Injectable()
export class ProjectMilestoneReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationService,
    private readonly points: PointsEngineService,
  ) {}

  /** 验收通过：submitted → accepted；全部通过自动结项并发放结项经验。
   * `initiatorUid` 缺省时按项目需求方快照解析（后台入口不传）。 */
  async acceptMilestone(
    projectId: string,
    milestoneId: string,
    initiatorUid?: string | null,
  ): Promise<{ code: number; finished: boolean; progress: number; projectName: string; milestoneName: string }> {
    const { project, milestone } = await this.requirePending(projectId, milestoneId)
    const now = formatNow()
    const respondentUids = await this.respondentUids(project.sourceDemandId)
    const initiator = initiatorUid !== undefined ? initiatorUid : await this.resolveSubjectUserId(project.demanderId)

    let finished = false
    let progress = project.progress

    /* 状态迁移 + 里程碑积分 + 重算进度/结项 + 结项经验同事务，
     * 避免并发覆盖与「已退回但仍发经验 / progress 与真实通过数不符」 */
    await this.prisma.$transaction(async (tx) => {
      /* 条件更新做幂等守卫：并发/重复验收只会命中一次状态迁移 */
      const updated = await tx.milestone.updateMany({
        where: { id: milestone.id, status: 'submitted' },
        data: { status: 'accepted', acceptAt: now },
      })
      if (updated.count !== 1) throw new ConflictException('里程碑状态已变更，请刷新后重试')

      /* 多选承接方时逐个发放（幂等键按里程碑+承接方去重） */
      for (const uid of respondentUids) {
        await this.points.issuePointsInTransaction(tx, uid, 'project_milestone', '项目里程碑通过验收', `project_milestone:${milestone.id}:${uid}`)
      }

      const all = await tx.milestone.findMany({ where: { projectId: project.id } })
      const acceptedCount = all.filter((m) => m.status === 'accepted').length
      if (all.length > 0 && acceptedCount === all.length) {
        /* 结项改为条件更新：并发下只有一个请求能命中，避免重复发放结项经验 */
        const closed = await tx.project.updateMany({
          where: { id: project.id, status: { in: ['running', 'paused'] } },
          data: { status: 'finished', progress: 100, archivableAt: now, finishedAt: now },
        })
        if (closed.count === 1) {
          finished = true
          progress = 100
          /* 结项经验（wiki §8.5）：按承接占比分配，总额 = 项目 expReward ?? project_completed 规则值 */
          await this.points.issueProjectFinishExperienceInTransaction(tx, project.name, project.expReward, project.undertakers)
        }
      } else {
        progress = Math.round((acceptedCount / all.length) * 100)
        await tx.project.update({ where: { id: project.id }, data: { progress } })
      }
    })

    for (const uid of respondentUids) {
      await this.notify.pushNotice(uid, {
        type: 'project',
        title: '里程碑已验收',
        content: `「${milestone.name}」已通过验收。`,
        link: `/me/projects/${project.id}`,
      })
    }

    if (finished) {
      const content = `「${project.name}」已完成全部里程碑，顺利结项。`
      const recipients = new Set<string>(respondentUids)
      if (initiator) recipients.add(initiator)
      for (const uid of recipients) {
        await this.notify.pushNotice(uid, { type: 'project', title: '项目已结项', content, link: `/me/projects/${project.id}` })
      }
    }
    return { code: 0, finished, progress, projectName: project.name, milestoneName: milestone.name }
  }

  /** 驳回（退回）：submitted → returned，承接方可重新提交（原因由调用方校验必填） */
  async returnMilestone(
    projectId: string,
    milestoneId: string,
    reason: string,
  ): Promise<{ code: number; projectName: string; milestoneName: string }> {
    const { project, milestone } = await this.requirePending(projectId, milestoneId)
    const returned = await this.prisma.milestone.updateMany({
      where: { id: milestone.id, status: 'submitted' },
      data: { status: 'returned', returnReason: reason, returnedAt: formatNow() },
    })
    if (returned.count !== 1) throw new ConflictException('里程碑状态已变更，请刷新后重试')

    for (const uid of await this.respondentUids(project.sourceDemandId)) {
      await this.notify.pushNotice(uid, {
        type: 'project',
        title: '里程碑被退回',
        content: `「${milestone.name}」未通过验收，原因：${reason}，请修改后重新提交。`,
        link: `/me/projects/${project.id}`,
      })
    }
    return { code: 0, projectName: project.name, milestoneName: milestone.name }
  }

  /** 需求方主体 ID（用户 uid / 企业 ID）→ 对应可访问的用户 uid；无法解析返回 null。
   * 企业主体落到企业联系人：后台代企业发需求时，站内信发给联系人，项目访问也按联系人口径放行。 */
  async resolveSubjectUserId(subjectId: string | null): Promise<string | null> {
    if (!subjectId) return null
    const user = await this.prisma.user.findUnique({ where: { uid: subjectId }, select: { uid: true } })
    if (user) return user.uid
    const enterprise = await this.prisma.enterprise.findUnique({
      where: { id: subjectId },
      select: { contactUserId: true },
    })
    return enterprise?.contactUserId ?? null
  }

  /** 承接方 uid 列表（由需求已被采用的响应反查；支持多选承接方，去重且剔除空 uid）。
   * 立项后响应收敛为 undertaken（已承接），故 accepted 与 undertaken 均计入。 */
  private async respondentUids(sourceDemandId: string | null): Promise<string[]> {
    if (!sourceDemandId) return []
    const rows = await this.prisma.demandRespondent.findMany({
      where: { demandId: sourceDemandId, status: { in: ['accepted', 'undertaken'] }, withdrawnAt: null },
      select: { userId: true },
      orderBy: { id: 'asc' },
    })
    return [...new Set(rows.map((r) => r.userId).filter((u): u is string => !!u))]
  }

  /** 取可审核的项目与里程碑：项目未归档且处于进行中/已暂停；里程碑存在且为「待验收」 */
  private async requirePending(projectId: string, milestoneId: string) {
    const numericId = Number(milestoneId)
    if (!Number.isInteger(numericId)) throw new NotFoundException('里程碑不存在')

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { undertakers: true },
    })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status !== 'running' && project.status !== 'paused') {
      throw new ConflictException('仅进行中或已暂停的项目可操作里程碑')
    }

    const milestone = await this.prisma.milestone.findFirst({ where: { id: numericId, projectId } })
    if (!milestone) throw new NotFoundException('里程碑不存在')
    if (milestone.status !== 'submitted') throw new ConflictException('该里程碑当前不是「待验收」状态')
    return { project, milestone }
  }
}
