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
import type { CreateTaskDto, UpdateTaskDto } from './dto/task.dto'
import type { AddFileDto } from './dto/add-file.dto'
import type { AddDiscussionDto } from './dto/add-discussion.dto'
import { StorageService } from '../../../common/storage/storage.service'

interface LoadedProject {
  project: Project & { undertakers: ProjectUndertaker[]; milestones: Milestone[] }
  isInit: boolean
  initiatorUid: string | null
}

/* 项目协作（M2-R R2，/api/app/me/projects）：
 * 我发起的/承接的项目列表与详情、里程碑提交/验收/退回（验收自动结项并发经验）、协作任务/文件/讨论。 */

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
        OR: [{ undertakers: { some: matched } }, { sourceDemandId: { in: myDemandIds.map((d) => d.id) } }],
      },
      include: { undertakers: true, milestones: { orderBy: { id: 'asc' } } },
      orderBy: { initiatedAt: 'desc' },
    })
    return Promise.all(
      projects.map((p) =>
        this.toMyProject(uid, p, myDemandIds.some((d) => d.id === p.sourceDemandId), myEntIds),
      ),
    )
  }

  /** 项目详情（参与双方可看；含来源需求、参与人快照、里程碑、任务、文件、讨论统计） */
  async projectDetail(uid: string, id: string) {
    const { project, isInit } = await this.loadProject(uid, id)
    const [sourceDemand, tasks, files, discussions] = await Promise.all([
      project.sourceDemandId
        ? this.prisma.demand.findUnique({ where: { id: project.sourceDemandId } })
        : Promise.resolve(null),
      this.prisma.projectTask.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } }),
      this.prisma.projectFile.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } }),
      this.prisma.projectDiscussion.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } }),
    ])
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
      tasks: tasks.map((t) => this.toTask(t)),
      files: files.map((f) => this.toFile(f)),
      discussionCount: discussions.length,
    }
  }

  /** 承接方提交里程碑（发起方 403；todo / returned → submitted） */
  async submitMilestone(uid: string, projectId: string, milestoneId: string, dto: SubmitMilestoneDto) {
    const { project, isInit, initiatorUid } = await this.loadProject(uid, projectId)
    if (isInit) throw new ForbiddenException('发起方不能提交里程碑')
    const mil = project.milestones.find((m) => String(m.id) === milestoneId)
    if (!mil) throw new NotFoundException('里程碑不存在')
    if (mil.status !== 'todo' && mil.status !== 'returned') throw new ConflictException('该里程碑当前不可提交')

    await this.prisma.milestone.update({
      where: { id: mil.id },
      data: {
        status: 'submitted',
        submitAt: formatNow(),
        attachments: dto.attachments ?? mil.attachments,
        returnReason: null,
        returnedAt: null,
      },
    })
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
    await this.prisma.milestone.update({ where: { id: mil.id }, data: { status: 'accepted', acceptAt: now } })

    const respondentUid = await this.respondentUid(project.sourceDemandId)
    if (respondentUid) {
      await this.points.issuePoints(respondentUid, 'project_milestone', '项目里程碑通过验收', `project_milestone:${mil.id}`)
    }
    if (respondentUid) {
      await this.notify.pushNotice(respondentUid, {
        type: 'project',
        title: '里程碑已验收',
        content: `「${mil.name}」已通过验收。`,
        link: `/me/projects/${project.id}`,
      })
    }

    const all = await this.prisma.milestone.findMany({ where: { projectId: project.id } })
    const acceptedCount = all.filter((m) => m.status === 'accepted').length
    if (all.length > 0 && acceptedCount === all.length) {
      await this.prisma.project.update({
        where: { id: project.id },
        data: { status: 'finished', progress: 100, archivableAt: now },
      })
      const title = '项目已结项'
      if (initiatorUid) {
        await this.notify.pushNotice(initiatorUid, { type: 'project', title, content: '「' + project.name + '」已完成全部里程碑，顺利结项。', link: `/me/projects/${project.id}` })
      }
      if (respondentUid) {
        await this.notify.pushNotice(respondentUid, { type: 'project', title, content: '「' + project.name + '」已完成全部里程碑，顺利结项。', link: `/me/projects/${project.id}` })
      }
      await this.issueFinishExperience(project.sourceDemandId, project.name)
    } else {
      await this.prisma.project.update({
        where: { id: project.id },
        data: { progress: Math.round((acceptedCount / all.length) * 100) },
      })
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

    await this.prisma.milestone.update({
      where: { id: mil.id },
      data: { status: 'returned', returnReason: reason, returnedAt: formatNow() },
    })
    const respondentUid = await this.respondentUid(project.sourceDemandId)
    if (respondentUid) {
      await this.notify.pushNotice(respondentUid, {
        type: 'project',
        title: '里程碑被退回',
        content: `「${mil.name}」未通过验收，原因：${reason}，请修改后重新提交。`,
        link: `/me/projects/${project.id}`,
      })
    }
    return { code: 0 }
  }

  /** 协作任务列表 */
  async listTasks(uid: string, projectId: string) {
    const { project } = await this.loadProject(uid, projectId)
    const rows = await this.prisma.projectTask.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } })
    return rows.map((t) => this.toTask(t))
  }

  /** 新增协作任务 */
  async createTask(uid: string, projectId: string, dto: CreateTaskDto) {
    const { project } = await this.loadProject(uid, projectId)
    const name = (dto.name ?? '').trim()
    if (!name) throw new BadRequestException('请输入任务名称')
    const created = await this.prisma.projectTask.create({
      data: { projectId: project.id, name, assignee: dto.assignee?.trim() || null, duedAt: dto.duedAt || null, createdAt: formatNow() },
    })
    return { id: created.id }
  }

  /** 更新协作任务（仅 name/assignee/status/duedAt） */
  async updateTask(uid: string, projectId: string, taskId: string, dto: UpdateTaskDto) {
    const { project } = await this.loadProject(uid, projectId)
    const task = await this.prisma.projectTask.findFirst({ where: { id: this.toNum(taskId), projectId: project.id } })
    if (!task) throw new NotFoundException('任务不存在')
    const data: Record<string, unknown> = {}
    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (!name) throw new BadRequestException('任务名称不能为空')
      data.name = name
    }
    if (dto.assignee !== undefined) data.assignee = dto.assignee?.trim() || null
    if (dto.status !== undefined) data.status = dto.status
    if (dto.duedAt !== undefined) data.duedAt = dto.duedAt || null
    await this.prisma.projectTask.update({ where: { id: task.id }, data })
    return { code: 0 }
  }

  /** 协作文件列表（url 为参与方鉴权后的下载地址）。 */
  async listFiles(uid: string, projectId: string) {
    const { project } = await this.loadProject(uid, projectId)
    const rows = await this.prisma.projectFile.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } })
    return rows.map((f) => this.toFile(f))
  }

  /** 新增协作文件元数据 */
  async addFile(uid: string, projectId: string, dto: AddFileDto) {
    const { project } = await this.loadProject(uid, projectId)
    if (!/^[0-9a-f-]+\.(?:png|jpe?g|gif|webp|pdf)$/i.test(dto.storeKey)) {
      throw new BadRequestException('文件存储键无效')
    }
    const stored = await this.storage.read(dto.storeKey)
    if (!stored) throw new BadRequestException('上传文件不存在或已失效')
    const created = await this.prisma.projectFile.create({
      data: { projectId: project.id, storeKey: dto.storeKey, name: dto.name, size: stored.length, uploaderId: uid, at: formatNow() },
    })
    return { id: created.id }
  }

  /** 参与方鉴权后读取协作文件，禁止经 public files 绕过项目权限。 */
  async readFile(uid: string, projectId: string, fileId: string) {
    const { project } = await this.loadProject(uid, projectId)
    const file = await this.prisma.projectFile.findFirst({
      where: { id: this.toNum(fileId), projectId: project.id },
    })
    if (!file) throw new NotFoundException('文件不存在')
    const buffer = await this.storage.read(file.storeKey)
    if (!buffer) throw new NotFoundException('文件不存在')
    return { buffer, name: file.name }
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

  /** 协作讨论列表 */
  async listDiscussions(uid: string, projectId: string) {
    const { project } = await this.loadProject(uid, projectId)
    const rows = await this.prisma.projectDiscussion.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } })
    return rows.map((m) => ({
      id: m.id,
      uid: m.senderId,
      name: m.senderName,
      content: m.content,
      at: m.at,
      mine: m.senderId === uid,
    }))
  }

  /** 新增讨论 */
  async addDiscussion(uid: string, name: string, projectId: string, dto: AddDiscussionDto) {
    const { project } = await this.loadProject(uid, projectId)
    const content = (dto.content ?? '').trim()
    if (!content) throw new BadRequestException('讨论内容不能为空')
    if (content.length > 500) throw new BadRequestException('讨论内容不能超过 500 字')
    await this.prisma.projectDiscussion.create({
      data: { projectId: project.id, senderId: uid, senderName: name || '用户', content, at: formatNow() },
    })
    return { code: 0 }
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
    if (project.sourceDemandId) {
      const demand = await this.prisma.demand.findUnique({ where: { id: project.sourceDemandId } })
      initiatorUid = demand?.publisherId ?? null
      isInit = demand?.publisherId === uid
    }
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
      return { role: '企业承接' as const, enterpriseName: e?.name, enterpriseId: matched[0]?.refId }
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
      ...(project.status === 'finished' && project.archivableAt ? { finishedAt: project.archivableAt } : {}),
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

  private toTask(t: { id: number; name: string; status: string; assignee: string | null; duedAt: string | null; createdAt: string }) {
    return {
      id: String(t.id),
      title: t.name,
      done: t.status === 'done',
      status: t.status,
      ...(t.assignee ? { assignee: t.assignee } : {}),
      ...(t.duedAt ? { duedAt: t.duedAt } : {}),
      at: t.createdAt,
    }
  }

  private toFile(f: { id: number; projectId: string; name: string; storeKey: string; size: number; at: string }) {
    return { id: String(f.id), name: f.name, url: `/api/app/me/projects/${f.projectId}/files/${f.id}/download`, size: f.size, at: f.at }
  }

  /** 承接方 uid（由需求已接受的响应反查） */
  private async respondentUid(sourceDemandId: string | null): Promise<string | null> {
    if (!sourceDemandId) return null
    const r = await this.prisma.demandRespondent.findFirst({
      where: { demandId: sourceDemandId, status: 'accepted' },
      select: { userId: true },
    })
    return r?.userId ?? null
  }

  /** 结项经验：按承接方身份发放 project_completed（事务外，规则缺失则 no-op） */
  private async issueFinishExperience(sourceDemandId: string | null, projectName: string) {
    if (!sourceDemandId) return
    const accepted = await this.prisma.demandRespondent.findFirst({
      where: { demandId: sourceDemandId, status: 'accepted' },
    })
    if (!accepted) return
    const ri = (accepted.responderIdentity ?? null) as Record<string, unknown> | null
    try {
      if (ri?.type === 'community_enterprise' && ri.enterpriseId) {
        await this.points.issueExperience('enterprise', ri.enterpriseId as string, 'project_completed', `「${projectName}」结项经验值`)
      } else if (accepted.userId) {
        await this.points.issueExperience('individual', accepted.userId, 'project_completed', `「${projectName}」结项经验值`)
      }
    } catch {
      /* noop */
    }
  }

  private toNum(id: string): number {
    const n = Number.parseInt(id, 10)
    return Number.isNaN(n) ? -1 : n
  }
}
