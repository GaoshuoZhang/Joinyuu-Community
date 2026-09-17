import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Milestone, Prisma, Project, ProjectUndertaker } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow, formatToday } from '../../common/utils/time'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import type { QueryProjectsDto } from './dto/query-projects.dto'

/* 承接方输入（ProjectInitPayload.undertakers，锁定签名）：enterprise=社区企业 / individual=用户 / custom=自定义 */
export interface UndertakerInput {
  type: 'enterprise' | 'individual' | 'custom'
  /** 企业 ID / 用户 ID / 自定义项为空串 */
  id: string
  /** 承接占比（整数百分比，合计须为 100） */
  share: number
  name?: string
  contactName?: string
  phone?: string
}

export interface MilestoneInput {
  name: string
  date: string
  /** 负责该节点的承接方展示名（可多选） */
  owners: string[]
}

export interface ProjectCreatePayload {
  projectName: string
  undertakers: UndertakerInput[]
  startDate?: string
  endDate?: string
  description: string
  milestones: MilestoneInput[]
  expReward?: number
}

/* 返回形状与 apps/admin/src/types/index.ts 逐字段一致 */
export interface ProjectUndertakerDto {
  type: string
  /** 承接方 ID（DB 列 refId 映射为响应字段 id） */
  id: string
  name: string
  share: number
  contactName?: string
  phone?: string
}

export interface MilestoneDto {
  name: string
  status: 'done' | 'active' | 'todo'
  date: string
  owners?: string[]
}

export interface ProjectDto {
  id: string
  name: string
  code: string
  undertakers: ProjectUndertakerDto[]
  status: string
  progress: number
  startDate: string
  endDate: string
  initiatedAt: string
  description: string
  milestones: MilestoneDto[]
  memberCount: number
  sourceDemandId?: string
  expReward?: number
  closeReason?: string
  deletedAt?: string
}

type ProjectWithRelations = Project & { undertakers: ProjectUndertaker[]; milestones: Milestone[] }

/* 名称解析后的承接方（refId = 输入 id，插入与映射共用） */
interface ResolvedUndertaker {
  type: string
  refId: string
  name: string
  share: number
  contactName?: string | null
  phone?: string | null
}

/* 项目域（wiki-backend.md §7.7/§8.5）：
 * 列表筛选/排序/分页、详情、新增（含锁定 createProject 供 demands 复用）、编辑、暂停/恢复/关闭状态机、
 * 结项 finishProject（里程碑全 done → finished 并按承接占比分配经验值） */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: QueryProjectsDto): Promise<{ list: ProjectDto[]; total: number }> {
    const where: Prisma.ProjectWhereInput = { deletedAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { name: { contains: kw, mode: 'insensitive' } },
        { code: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.status) where.status = query.status

    /* 主行查询含承接方（参与人/企业筛选需用）；里程碑与承接方映射在分页后批量补取 */
    const rows = await this.prisma.project.findMany({ where, include: { undertakers: true } })

    let list = rows as ProjectWithRelations[]

    if (query.participant) {
      const user = await this.prisma.user.findUnique({
        where: { uid: query.participant },
        include: { identities: true },
      })
      const enterpriseIds =
        user?.identities
          .filter((i) => i.type === 'community_enterprise' && i.enterpriseId != null)
          .map((i) => i.enterpriseId as string) ?? []
      list = list.filter((p) =>
        p.undertakers.some(
          (t) =>
            (t.type === 'individual' && t.refId === query.participant) ||
            (t.type === 'enterprise' && enterpriseIds.includes(t.refId)),
        ),
      )
    }

    if (query.enterprise) {
      const isCommunity = !!(await this.prisma.enterprise.findUnique({ where: { id: query.enterprise } }))
      if (isCommunity) {
        list = list.filter((p) => p.undertakers.some((t) => t.type === 'enterprise' && t.refId === query.enterprise))
      } else {
        const profile = await this.prisma.externalEnterpriseProfile.findUnique({
          where: { id: query.enterprise },
        })
        const memberIds = profile
          ? (
              await this.prisma.userIdentity.findMany({
                where: { type: 'external_enterprise', enterpriseName: profile.name },
                select: { userId: true },
              })
            ).map((m) => m.userId)
          : []
        list = list.filter((p) => p.undertakers.some((t) => t.type === 'individual' && memberIds.includes(t.refId)))
      }
    }

    /* 排序：默认立项日期倒序（最新立项在前），可按立项日期/编号正倒序 */
    const field = query.sortBy ?? 'initiatedAt'
    const dir = query.sortOrder === 'ascend' ? 1 : -1
    list.sort((a, b) => {
      const av = field === 'id' ? Number(a.id.replace('P', '')) : a.initiatedAt
      const bv = field === 'id' ? Number(b.id.replace('P', '')) : b.initiatedAt
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })

    const total = list.length
    const start = (query.page - 1) * query.pageSize
    const page = list.slice(start, start + query.pageSize)

    /* 仅当页批量补取承接方与里程碑（替代全量 include，随分页收缩载入量） */
    const pageIds = page.map((p) => p.id)
    const [undertakers, milestones] = await Promise.all([
      pageIds.length
        ? this.prisma.projectUndertaker.findMany({ where: { projectId: { in: pageIds } }, orderBy: { id: 'asc' } })
        : [],
      pageIds.length
        ? this.prisma.milestone.findMany({ where: { projectId: { in: pageIds } }, orderBy: { id: 'asc' } })
        : [],
    ])
    const undertakersByProject = new Map<string, ProjectUndertaker[]>()
    for (const u of undertakers) {
      const arr = undertakersByProject.get(u.projectId) ?? []
      arr.push(u)
      undertakersByProject.set(u.projectId, arr)
    }
    const milestonesByProject = new Map<string, Milestone[]>()
    for (const m of milestones) {
      const arr = milestonesByProject.get(m.projectId) ?? []
      arr.push(m)
      milestonesByProject.set(m.projectId, arr)
    }

    return {
      list: page.map((p) =>
        toProjectDto({
          ...p,
          undertakers: undertakersByProject.get(p.id) ?? [],
          milestones: milestonesByProject.get(p.id) ?? [],
        }),
      ),
      total,
    }
  }

  async detail(id: string): Promise<ProjectDto> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        undertakers: { orderBy: { id: 'asc' } },
        milestones: { orderBy: { id: 'asc' } },
      },
    })
    if (!project) throw new NotFoundException('项目不存在')
    return toProjectDto(project)
  }

  /* 锁定签名（demands-api 复用）：新增项目（无来源需求）
   * 承接方非空、share 合计 100、名称解析（404 承接企业/承接人不存在）、code=JY-YYYY-NN 按年原子发号 */
  async createProject(payload: ProjectCreatePayload, operator: string): Promise<ProjectDto> {
    const project = await this.prisma.$transaction((tx) => this.createProjectInHostTx(tx, payload))

    await this.audit.record({
      module: '项目管理',
      action: '新增项目',
      target: `${project.id} · ${project.name}`,
      detail: project.code,
      after: { status: project.status, code: project.code },
      operator,
    })

    return toProjectDto(project)
  }

  /** 在宿主事务内新增项目（校验/名称解析/编号全部走事务连接）——供需求立项与直接新增复用 */
  async createProjectInHostTx(
    tx: Prisma.TransactionClient,
    payload: ProjectCreatePayload,
  ): Promise<ProjectWithRelations> {
    if (payload.undertakers.length === 0) throw new BadRequestException('请至少选择一个承接方')

    const undertakers = await this.resolveUndertakers(tx, payload.undertakers)
    const shareSum = undertakers.reduce((s, u) => s + u.share, 0)
    if (shareSum !== 100) throw new BadRequestException('承接占比合计须为 100%')

    /* code 序号原子取号（IdSequence），避免并发下 count+1 与 @unique(code) 冲突 */
    const year = new Date().getFullYear()
    const seq = await this.ids.nextNumber(`CODE-${year}`)
    const code = `JY-${year}-${String(seq).padStart(2, '0')}`

    return this.createProjectInTx(tx, payload, undertakers, code)
  }

  /** 事务内新增项目主体（输入校验与名称解析在事务外完成）——供需求立项在单一事务中复用 */
  async createProjectInTx(
    tx: Prisma.TransactionClient,
    payload: ProjectCreatePayload,
    undertakers: ResolvedUndertaker[],
    code: string,
  ): Promise<ProjectWithRelations> {
    const id = await this.ids.next('P')
    const milestones = payload.milestones
      .filter((m) => m.name.trim())
      .map((m) => ({ name: m.name.trim(), status: 'todo' as const, date: m.date, owners: m.owners ?? [] }))

    const created = await tx.project.create({
      data: {
        id,
        name: payload.projectName,
        code,
        status: 'running',
        progress: 0,
        startDate: payload.startDate ?? '',
        endDate: payload.endDate ?? '',
        initiatedAt: formatToday(),
        description: sanitizeHtml(payload.description),
        memberCount: undertakers.length,
        expReward: payload.expReward ?? null,
      },
    })

    for (const u of undertakers) {
      await tx.projectUndertaker.create({
        data: {
          projectId: id,
          type: u.type,
          refId: u.refId,
          name: u.name,
          share: u.share,
          contactName: u.contactName ?? null,
          phone: u.phone ?? null,
        },
      })
    }
    for (const m of milestones) {
      await tx.milestone.create({
        data: { projectId: id, name: m.name, status: m.status, date: m.date, owners: m.owners },
      })
    }

    return {
      ...created,
      undertakers: undertakers.map((u) => ({
        type: u.type,
        refId: u.refId,
        name: u.name,
        share: u.share,
        contactName: u.contactName ?? null,
        phone: u.phone ?? null,
      })) as ProjectUndertaker[],
      milestones: milestones.map((m) => ({
        name: m.name,
        status: m.status,
        date: m.date,
        owners: m.owners,
      })) as Milestone[],
    }
  }

  /* 编辑（wiki-backend.md §7.7）：已结项项目只读；其余状态可编辑（前端禁用 finished 入口，后端同样强制）；
   * 不改状态/编号；里程碑整体重置为 todo；重算 memberCount */
  async update(id: string, payload: ProjectCreatePayload): Promise<{ code: number }> {
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status === 'finished') throw new ConflictException('已结项的项目不可编辑')

    const undertakers = await this.resolveUndertakers(this.prisma, payload.undertakers)
    const milestones = payload.milestones
      .filter((m) => m.name.trim())
      .map((m) => ({ name: m.name.trim(), status: 'todo' as const, date: m.date, owners: m.owners ?? [] }))

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: {
          name: payload.projectName,
          memberCount: undertakers.length,
          ...(payload.startDate != null ? { startDate: payload.startDate } : {}),
          ...(payload.endDate != null ? { endDate: payload.endDate } : {}),
          description: sanitizeHtml(payload.description),
        },
      })

      await tx.projectUndertaker.deleteMany({ where: { projectId: id } })
      for (const u of undertakers) {
        await tx.projectUndertaker.create({
          data: {
            projectId: id,
            type: u.type,
            refId: u.refId,
            name: u.name,
            share: u.share,
            contactName: u.contactName ?? null,
            phone: u.phone ?? null,
          },
        })
      }

      await tx.milestone.deleteMany({ where: { projectId: id } })
      for (const m of milestones) {
        await tx.milestone.create({
          data: { projectId: id, name: m.name, status: m.status, date: m.date, owners: m.owners },
        })
      }
    })

    return { code: 0 }
  }

  async pause(id: string, operator: string): Promise<{ code: number }> {
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status !== 'running') throw new ConflictException('仅进行中的项目可暂停')
    await this.prisma.project.update({ where: { id }, data: { status: 'paused' } })

    await this.audit.record({
      module: '项目管理',
      action: '项目暂停',
      target: `${project.id} · ${project.name}`,
      before: { status: project.status },
      after: { status: 'paused' },
      operator,
    })
    return { code: 0 }
  }

  async resume(id: string, operator: string): Promise<{ code: number }> {
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status !== 'paused') throw new ConflictException('仅已暂停的项目可恢复')
    await this.prisma.project.update({ where: { id }, data: { status: 'running' } })

    await this.audit.record({
      module: '项目管理',
      action: '项目恢复',
      target: `${project.id} · ${project.name}`,
      before: { status: project.status },
      after: { status: 'running' },
      operator,
    })
    return { code: 0 }
  }

  async close(id: string, reason: string | undefined, operator: string): Promise<{ code: number }> {
    const project = await this.prisma.project.findUnique({ where: { id } })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status !== 'paused') throw new ConflictException('仅已暂停的项目可关闭')
    const trimmed = (reason ?? '').trim()
    if (!trimmed) throw new BadRequestException('请填写关闭原因')

    await this.prisma.project.update({
      where: { id },
      data: { status: 'closed', closeReason: trimmed, archivableAt: formatNow() },
    })

    await this.audit.record({
      module: '项目管理',
      action: '项目关闭',
      target: `${project.id} · ${project.name}`,
      detail: trimmed,
      before: { status: project.status },
      after: { status: 'closed', closeReason: trimmed },
      operator,
    })

    return { code: 0 }
  }

  /* 项目结项（wiki-backend.md §8.5）——非端点，供后续触发接线：
   * 里程碑全 done → finished；总经验值 = expReward ?? project_completed 规则值（启用时）；
   * 按承接占比向下取整分配（余数给首个参与方），仅社区企业与持社区个体身份的用户参与，
   * 合作企业/无社区个体身份个人/自定义承接方份额丢弃；事务写经验值流水 + 等级重算 */
  async finishProject(id: string, operator: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { undertakers: { orderBy: { id: 'asc' } }, milestones: true },
    })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status === 'finished') return
    if (project.milestones.length === 0 || !project.milestones.every((m) => m.status === 'done')) return

    let totalExp = project.expReward
    if (totalExp == null) {
      const rule = await this.prisma.experienceRule.findUnique({ where: { code: 'project_completed' } })
      totalExp = rule && rule.status === 'enabled' ? rule.exp : 0
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: { status: 'finished', progress: 100, archivableAt: formatNow() },
      })
      if (totalExp == null || totalExp <= 0) return

      const individualRefIds = project.undertakers
        .filter((u) => u.type === 'individual')
        .map((u) => u.refId)
      const eligibleIndividualIds = new Set(
        (
          await tx.userIdentity.findMany({
            where: { type: 'community_individual', userId: { in: individualRefIds } },
            select: { userId: true },
          })
        ).map((i) => i.userId),
      )

      /* 参与方：enterprise（社区企业）与持社区个体身份的 individual；custom 丢弃 */
      const participants = project.undertakers.filter(
        (u) => u.type === 'enterprise' || (u.type === 'individual' && eligibleIndividualIds.has(u.refId)),
      )
      if (participants.length === 0) return

      const amounts = participants.map((p) => Math.floor((totalExp! * p.share) / 100))
      const sum = amounts.reduce((s, a) => s + a, 0)
      amounts[0] += totalExp! - sum

      const tiers = await tx.levelTier.findMany({ orderBy: { threshold: 'desc' } })

      for (let idx = 0; idx < participants.length; idx++) {
        const p = participants[idx]
        const amount = amounts[idx]
        if (amount <= 0) continue

        if (p.type === 'enterprise') {
          const enterprise = await tx.enterprise.findUnique({ where: { id: p.refId } })
          if (!enterprise) continue
          const balance = enterprise.experience + amount
          const level = this.resolveLevel(tiers.filter(t => t.identityType === 'community_enterprise'), balance)
          await tx.enterprise.update({ where: { id: p.refId }, data: { experience: balance } })
          await tx.userIdentity.updateMany({
            where: { type: 'community_enterprise', enterpriseId: p.refId },
            data: { experience: balance, level },
          })
          await tx.experienceRecord.create({
            data: {
              id: await this.ids.next('EX'),
              targetType: 'enterprise',
              targetId: p.refId,
              delta: amount,
              balance,
              reason: `「${project.name}」结项经验值`,
              at: formatNow(),
              operator: '系统',
              source: 'rule',
            },
          })
        } else {
          const identity = await tx.userIdentity.findFirst({
            where: { userId: p.refId, type: 'community_individual' },
          })
          if (!identity) continue
          const balance = (identity.experience ?? 0) + amount
          const level = this.resolveLevel(tiers.filter(t => t.identityType === 'community_individual'), balance)
          await tx.userIdentity.update({
            where: { id: identity.id },
            data: { experience: balance, level },
          })
          await tx.experienceRecord.create({
            data: {
              id: await this.ids.next('EX'),
              targetType: 'individual',
              targetId: p.refId,
              delta: amount,
              balance,
              reason: `「${project.name}」结项经验值`,
              at: formatNow(),
              operator: '系统',
              source: 'rule',
            },
          })
        }
      }
    })
    void operator
  }

  async archive(id: string, operator: string): Promise<{ code: number }> {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } })
    if (!project) throw new NotFoundException('项目不存在')
    if (project.status !== 'finished' && project.status !== 'closed') {
      throw new ConflictException('仅已结项或已关闭的项目可归档')
    }

    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '项目管理',
      action: '归档项目',
      target: `${project.id} · ${project.name}`,
      before: { status: project.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }

  /* 承接方展示名：企业→企业名；个人→「昵称 · 社区个体头衔」；自定义→name||id
   * db 为 PrismaService 或事务客户端，供列表校验与事务内新增复用 */
  private async resolveUndertakers(
    db: Prisma.TransactionClient | PrismaService,
    input: UndertakerInput[],
  ): Promise<ResolvedUndertaker[]> {
    return Promise.all(
      input.map(async (u) => {
        if (u.type === 'enterprise') {
          const enterprise = await db.enterprise.findUnique({ where: { id: u.id } })
          if (!enterprise) throw new NotFoundException('承接企业不存在')
          return { type: u.type, refId: u.id, name: enterprise.name, share: u.share }
        }
        if (u.type === 'individual') {
          const user = await db.user.findUnique({ where: { uid: u.id }, include: { identities: true } })
          if (!user) throw new NotFoundException('承接人不存在')
          const identity = user.identities.find((i) => i.type === 'community_individual')
          return { type: u.type, refId: u.id, name: `${user.nickname} · ${identity?.title ?? ''}`, share: u.share }
        }
        return {
          type: u.type,
          refId: u.id,
          name: u.name || u.id,
          share: u.share,
          contactName: u.contactName ?? null,
          phone: u.phone ?? null,
        }
      }),
    )
  }

  /** 门槛最高的、threshold <= experience 的等级（无匹配则最低 1 级）——复刻 PointsEngineService.resolveLevel */
  private resolveLevel(tiers: Array<{ level: number; threshold: number }>, experience: number): number {
    const tier = tiers.find((t) => t.threshold <= experience)
    return tier ? tier.level : 1
  }
}

/* Prisma 行 → Project 形状（refId → id；可选字段缺失省略） */
function toProjectDto(project: ProjectWithRelations): ProjectDto {
  const dto: ProjectDto = {
    id: project.id,
    name: project.name,
    code: project.code,
    undertakers: project.undertakers.map((t) => {
      const u: ProjectUndertakerDto = { type: t.type, id: t.refId, name: t.name, share: t.share }
      if (t.contactName != null) u.contactName = t.contactName
      if (t.phone != null) u.phone = t.phone
      return u
    }),
    status: project.status,
    progress: project.progress,
    startDate: project.startDate,
    endDate: project.endDate,
    initiatedAt: project.initiatedAt,
    description: project.description,
    milestones: project.milestones.map((m) => ({
      name: m.name,
      status: m.status as MilestoneDto['status'],
      date: m.date,
      owners: m.owners,
    })),
    memberCount: project.memberCount,
  }
  if (project.sourceDemandId != null) dto.sourceDemandId = project.sourceDemandId
  if (project.expReward != null) dto.expReward = project.expReward
  if (project.closeReason != null) dto.closeReason = project.closeReason
  if (project.deletedAt != null) dto.deletedAt = project.deletedAt
  return dto
}
